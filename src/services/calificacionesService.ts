/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Calificacion } from '../types';
import { getCurrentIdToken } from './authService';

export interface GuardarCalificacionesPayload {
  grupoId: string;
  calificaciones?: Array<{
    alumnoId: string;
    actividadId: string;
    nota: number; // Numérico finito NOT NULL (0-10)
  }>;
  retirar?: Array<{
    alumnoId: string;
    actividadId: string;
  }>;
}

export interface GuardarCalificacionesResultado {
  success: boolean;
  actualizadas: number;
  guardadas?: number;
  retiradas?: number;
  calificaciones: Calificacion[];
  error?: string;
  origen?: 'supabase' | 'local_backup';
}

const STORAGE_KEY_PREFIX = 'fernanditio_calif_backup_';
const SUPABASE_FUNCTIONS_BASE = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1';

/**
 * Servicio de gestión de calificaciones para la interfaz de evaluación de rúbricas.
 * Realiza la persistencia autorizada en Supabase mediante la Edge Function fernanditio-data
 * clasificando las notas numéricas para upsert y las ausencias/null para retirada (delete),
 * y mantiene un respaldo local en localStorage para prevenir pérdidas de datos en la sesión.
 */
export async function guardarCalificacionesEvaluacion(
  grupoId: string,
  calificacionesActuales: Calificacion[],
  nuevasCalificaciones: Array<{
    alumnoId: string;
    actividadId: string;
    nota: number | null;
  }>
): Promise<GuardarCalificacionesResultado> {
  if (!grupoId || typeof grupoId !== 'string') {
    throw new Error('Identificador de grupo no válido.');
  }

  // 1. Validaciones estrictas de datos de entrada en el cliente
  for (const c of nuevasCalificaciones) {
    if (!c.alumnoId || typeof c.alumnoId !== 'string') {
      throw new Error('Identificador de alumno no válido en la calificación.');
    }
    if (!c.actividadId || typeof c.actividadId !== 'string') {
      throw new Error('Identificador de actividad no válido en la calificación.');
    }
    if (c.nota !== null && c.nota !== undefined) {
      if (typeof c.nota !== 'number' || isNaN(c.nota) || !isFinite(c.nota) || c.nota < 0 || c.nota > 10) {
        throw new Error(`La calificación de ${c.nota} está fuera de los límites permitidos (0-10).`);
      }
    }
  }

  // 2. Cálculo optimista y división en operaciones: Guardar (nota numérica) vs Retirar (ausencia de fila/pendiente)
  const mapaCalificaciones = new Map<string, Calificacion>();
  calificacionesActuales.forEach((c) => {
    mapaCalificaciones.set(`${c.alumno_id}_${c.actividad_id}`, { ...c });
  });

  const nowIso = new Date().toISOString();
  const calificacionesAGuardar: Array<{ alumnoId: string; actividadId: string; nota: number }> = [];
  const calificacionesARetirar: Array<{ alumnoId: string; actividadId: string }> = [];

  let contadorGuardadas = 0;
  let contadorRetiradas = 0;

  for (const nueva of nuevasCalificaciones) {
    const alId = nueva.alumnoId.trim();
    const actId = nueva.actividadId.trim();
    const key = `${alId}_${actId}`;
    const existente = mapaCalificaciones.get(key);

    if (nueva.nota !== null && nueva.nota !== undefined) {
      const notaNumerica = Number(nueva.nota);
      calificacionesAGuardar.push({
        alumnoId: alId,
        actividadId: actId,
        nota: notaNumerica,
      });

      if (existente) {
        mapaCalificaciones.set(key, {
          ...existente,
          nota: notaNumerica,
          updated_at: nowIso,
        });
      } else {
        const nuevoId = Math.floor(Date.now() + Math.random() * 1000);
        mapaCalificaciones.set(key, {
          id: nuevoId,
          grupo_id: grupoId,
          alumno_id: alId,
          actividad_id: actId,
          nota: notaNumerica,
          updated_at: nowIso,
        });
      }
      contadorGuardadas++;
    } else {
      // Nota null o desmarcada: si existía previamente una calificación en memoria/base, se retira explícitamente
      if (existente) {
        calificacionesARetirar.push({
          alumnoId: alId,
          actividadId: actId,
        });
        mapaCalificaciones.delete(key);
        contadorRetiradas++;
      }
    }
  }

  // Si no hay operaciones efectivas que realizar
  if (calificacionesAGuardar.length === 0 && calificacionesARetirar.length === 0) {
    return {
      success: true,
      actualizadas: 0,
      guardadas: 0,
      retiradas: 0,
      calificaciones: Array.from(mapaCalificaciones.values()),
      origen: 'supabase',
    };
  }

  const listaActualizadaLocal = Array.from(mapaCalificaciones.values());

  // 3. Respaldo local preventivo en localStorage antes de la llamada de red
  try {
    const backupKey = `${STORAGE_KEY_PREFIX}${grupoId}`;
    localStorage.setItem(backupKey, JSON.stringify(listaActualizadaLocal));
  } catch (err) {
    console.warn('[calificacionesService] No se pudo guardar el respaldo local preventivo:', err);
  }

  // 4. Persistencia autorizada y real en Supabase a través de la Edge Function
  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión de autenticación activa para persistir las calificaciones en Supabase.');
  }

  const endpoint = `${SUPABASE_FUNCTIONS_BASE}/fernanditio-data/calificaciones`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        grupoId,
        calificaciones: calificacionesAGuardar,
        retirar: calificacionesARetirar,
      }),
    });

    if (!response.ok) {
      let detalleError = `Error HTTP ${response.status}: ${response.statusText}`;
      try {
        const jsonError = await response.json();
        if (jsonError?.error) {
          detalleError = jsonError.error;
        } else if (jsonError?.message) {
          detalleError = jsonError.message;
        }
      } catch {
        // Ignorar fallo de parseo si la respuesta de error no es JSON
      }

      throw new Error(`Error en Supabase (${response.status}): ${detalleError}`);
    }

    const data = await response.json();

    if (!data || !data.success || !Array.isArray(data.calificaciones)) {
      throw new Error('La respuesta de Supabase no contiene la confirmación o la lista de calificaciones esperada.');
    }

    // 5. Actualizar el respaldo local con la verdad definitiva de Supabase
    try {
      const backupKey = `${STORAGE_KEY_PREFIX}${grupoId}`;
      localStorage.setItem(backupKey, JSON.stringify(data.calificaciones));
    } catch (err) {
      console.warn('[calificacionesService] No se pudo actualizar el respaldo local con los datos remotos:', err);
    }

    return {
      success: true,
      actualizadas: typeof data.actualizadas === 'number' ? data.actualizadas : (contadorGuardadas + contadorRetiradas),
      guardadas: typeof data.guardadas === 'number' ? data.guardadas : contadorGuardadas,
      retiradas: typeof data.retiradas === 'number' ? data.retiradas : contadorRetiradas,
      calificaciones: data.calificaciones,
      origen: 'supabase',
    };
  } catch (err: any) {
    console.error('[calificacionesService] Error en la llamada a Supabase:', err);

    // Regla obligatoria: No presentar datos locales como si se hubieran guardado en Supabase.
    // Propagamos el error explicando que los datos permanecen en búfer local pero no en remoto.
    const mensajeDetallado = err?.message || 'Error de conexión con el servidor de Supabase.';
    throw new Error(
      `${mensajeDetallado}. Los cambios se han conservado en este dispositivo, pero NO se han confirmado en la base de datos remota.`
    );
  }
}

export interface DiferenciaRespaldo {
  alumnoId: string;
  actividadId: string;
  notaRemota: number | null;
  notaLocal: number | null;
}

export interface DiagnosticoRespaldo {
  hayRespaldo: boolean;
  hayDiferencias: boolean;
  diferencias: DiferenciaRespaldo[];
  totalDiferencias: number;
  calificacionesLocales: Calificacion[];
}

/**
 * Recupera el respaldo local de calificaciones si estuviera disponible
 */
export function recuperarRespaldoCalificaciones(grupoId: string): Calificacion[] | null {
  try {
    const backupKey = `${STORAGE_KEY_PREFIX}${grupoId}`;
    const item = localStorage.getItem(backupKey);
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignorar fallos de parseo
  }
  return null;
}

/**
 * Elimina de forma segura el respaldo local de un grupo una vez confirmado o descartado
 */
export function limpiarRespaldoCalificaciones(grupoId: string): void {
  try {
    const backupKey = `${STORAGE_KEY_PREFIX}${grupoId}`;
    localStorage.removeItem(backupKey);
  } catch (err) {
    console.warn('[calificacionesService] No se pudo limpiar el respaldo local:', err);
  }
}

/**
 * Compara el respaldo local con las calificaciones obtenidas de Supabase.
 * No sobrescribe automáticamente ninguna nota. Trata la ausencia de fila
 * en el servidor como equivalente a null (evidencia pendiente), y distingue
 * estrictamente entre null y cero (0 real).
 */
export function compararRespaldoConRemoto(
  grupoId: string,
  calificacionesRemotas: Calificacion[]
): DiagnosticoRespaldo {
  const respaldoLocal = recuperarRespaldoCalificaciones(grupoId);
  if (!respaldoLocal || !Array.isArray(respaldoLocal) || respaldoLocal.length === 0) {
    return {
      hayRespaldo: false,
      hayDiferencias: false,
      diferencias: [],
      totalDiferencias: 0,
      calificacionesLocales: [],
    };
  }

  // Mapa de notas remotas: la ausencia de fila equivale a null (pendiente)
  const mapaRemoto = new Map<string, number | null>();
  (calificacionesRemotas || []).forEach((c) => {
    mapaRemoto.set(
      `${c.alumno_id}_${c.actividad_id}`,
      (c.nota !== null && c.nota !== undefined && !isNaN(Number(c.nota))) ? Number(c.nota) : null
    );
  });

  // Mapa de notas locales: ausencia o null equivale a null (pendiente)
  const mapaLocal = new Map<string, number | null>();
  (respaldoLocal || []).forEach((c) => {
    if (c && c.alumno_id && c.actividad_id) {
      mapaLocal.set(
        `${c.alumno_id}_${c.actividad_id}`,
        (c.nota !== null && c.nota !== undefined && !isNaN(Number(c.nota))) ? Number(c.nota) : null
      );
    }
  });

  const todasLasClaves = new Set([...mapaRemoto.keys(), ...mapaLocal.keys()]);
  const diferencias: DiferenciaRespaldo[] = [];

  for (const key of todasLasClaves) {
    const notaRemota = mapaRemoto.has(key) ? mapaRemoto.get(key)! : null;
    const notaLocal = mapaLocal.has(key) ? mapaLocal.get(key)! : null;

    // Si ambas son null (ambas ausentes o pendientes), coinciden y NO generan diferencia
    if (notaLocal === null && notaRemota === null) {
      continue;
    }

    // Comparación estricta distinguiendo null de 0
    if (notaLocal !== notaRemota) {
      const [alumnoId, actividadId] = key.split('_');
      diferencias.push({
        alumnoId,
        actividadId,
        notaRemota,
        notaLocal,
      });
    }
  }

  return {
    hayRespaldo: true,
    hayDiferencias: diferencias.length > 0,
    diferencias,
    totalDiferencias: diferencias.length,
    calificacionesLocales: respaldoLocal,
  };
}
