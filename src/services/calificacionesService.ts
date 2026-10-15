/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Calificacion, CalificacionApartado } from '../types';
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

// =========================================================================
// SERVICIOS PARA CALIFICACIONES GRANULARES POR APARTADO DE RÚBRICA
// =========================================================================

const STORAGE_APARTADOS_KEY_PREFIX = 'fernanditio_calif_apartados_backup_';

export interface GuardarCalificacionesApartadosPayload {
  grupoId: string;
  calificacionesApartados?: Array<{
    alumnoId: string;
    apartadoId: string; // UUID persistente del apartado
    rubricaId: string;
    actividadId?: string | null;
    nota: number; // 0 a 10
  }>;
  retirar?: Array<{
    alumnoId: string;
    apartadoId: string;
    rubricaId: string;
    actividadId?: string | null;
  }>;
}

export interface GuardarCalificacionesApartadosResultado {
  success: boolean;
  actualizadas: number;
  guardadas?: number;
  retiradas?: number;
  calificacionesApartados: CalificacionApartado[];
  error?: string;
  origen?: 'supabase' | 'local_backup';
}

/**
 * Guarda y sincroniza las calificaciones individuales de los apartados de una rúbrica en Supabase.
 * - Cada calificación está asociada a un UUID persistente de apartado.
 * - Distingue estrictamente entre 0.0 (calificación real) y null/ausencia (pendiente de evaluar).
 * - No modifica ni altera las calificaciones históricas de public.calificaciones.
 */
export async function guardarCalificacionesApartados(
  grupoId: string,
  calificacionesApartadosActuales: CalificacionApartado[],
  nuevasNotas: Array<{
    alumnoId: string;
    apartadoId: string;
    rubricaId: string;
    actividadId?: string | null;
    nota: number | null; // null = retirar / pendiente; number (0-10) = guardar
  }>
): Promise<GuardarCalificacionesApartadosResultado> {
  if (!grupoId || typeof grupoId !== 'string') {
    throw new Error('Identificador de grupo no válido.');
  }

  // 1. Validaciones de entrada
  for (const item of nuevasNotas) {
    if (!item.alumnoId || typeof item.alumnoId !== 'string') {
      throw new Error('Identificador de alumno no válido en la calificación del apartado.');
    }
    if (!item.apartadoId || typeof item.apartadoId !== 'string') {
      throw new Error('Identificador UUID de apartado no válido.');
    }
    if (!item.rubricaId || typeof item.rubricaId !== 'string') {
      throw new Error('Identificador de rúbrica no válido.');
    }
    if (item.nota !== null && item.nota !== undefined) {
      if (typeof item.nota !== 'number' || isNaN(item.nota) || !isFinite(item.nota) || item.nota < 0 || item.nota > 10) {
        throw new Error(`La calificación de ${item.nota} en el apartado está fuera del rango permitido (0-10).`);
      }
    }
  }

  // 2. Cálculo optimista y división en operaciones
  const mapa = new Map<string, CalificacionApartado>();
  (calificacionesApartadosActuales || []).forEach((ca) => {
    const actKey = ca.actividad_id || '';
    mapa.set(`${ca.alumno_id}_${actKey}_${ca.rubrica_id}_${ca.apartado_id}`, { ...ca });
  });

  const nowIso = new Date().toISOString();
  const paraGuardar: Array<{
    alumnoId: string;
    apartadoId: string;
    rubricaId: string;
    actividadId?: string | null;
    nota: number;
  }> = [];
  const paraRetirar: Array<{
    alumnoId: string;
    apartadoId: string;
    rubricaId: string;
    actividadId?: string | null;
  }> = [];

  let contadorGuardadas = 0;
  let contadorRetiradas = 0;

  for (const n of nuevasNotas) {
    const alId = n.alumnoId.trim();
    const apId = n.apartadoId.trim();
    const rubId = n.rubricaId.trim();
    const actId = n.actividadId ? n.actividadId.trim() : null;
    const actKey = actId || '';
    const key = `${alId}_${actKey}_${rubId}_${apId}`;
    const existente = mapa.get(key);

    if (n.nota !== null && n.nota !== undefined) {
      const notaNum = Number(n.nota);
      paraGuardar.push({
        alumnoId: alId,
        apartadoId: apId,
        rubricaId: rubId,
        actividadId: actId,
        nota: notaNum,
      });

      if (existente) {
        mapa.set(key, {
          ...existente,
          nota: notaNum,
          updated_at: nowIso,
        });
      } else {
        const nuevoId = Math.floor(Date.now() + Math.random() * 1000);
        mapa.set(key, {
          id: nuevoId,
          grupo_id: grupoId,
          alumno_id: alId,
          actividad_id: actId || null,
          rubrica_id: rubId,
          apartado_id: apId,
          nota: notaNum,
          updated_at: nowIso,
        });
      }
      contadorGuardadas++;
    } else {
      if (existente) {
        paraRetirar.push({
          alumnoId: alId,
          apartadoId: apId,
          rubricaId: rubId,
          actividadId: actId,
        });
        mapa.delete(key);
        contadorRetiradas++;
      }
    }
  }

  if (paraGuardar.length === 0 && paraRetirar.length === 0) {
    return {
      success: true,
      actualizadas: 0,
      guardadas: 0,
      retiradas: 0,
      calificacionesApartados: Array.from(mapa.values()),
      origen: 'supabase',
    };
  }

  const listaActualizadaLocal = Array.from(mapa.values());

  // 3. Respaldo local preventivo en localStorage
  try {
    const backupKey = `${STORAGE_APARTADOS_KEY_PREFIX}${grupoId}`;
    localStorage.setItem(backupKey, JSON.stringify(listaActualizadaLocal));
  } catch (err) {
    console.warn('[calificacionesService] No se pudo guardar el respaldo local de apartados:', err);
  }

  // 4. Llamada al servidor Supabase mediante Edge Function
  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión de autenticación activa para persistir en Supabase.');
  }

  const endpoint = `${SUPABASE_FUNCTIONS_BASE}/fernanditio-data`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        tipo: 'apartados',
        grupoId,
        calificacionesApartados: paraGuardar,
        retirar: paraRetirar,
      }),
    });

    if (!response.ok) {
      let detalleError = `Error HTTP ${response.status}: ${response.statusText}`;
      try {
        const jsonError = await response.json();
        if (jsonError?.error) detalleError = jsonError.error;
      } catch {
        // Fallo de parseo json
      }
      throw new Error(detalleError);
    }

    const data = await response.json();
    if (!data || !data.success || !Array.isArray(data.calificacionesApartados)) {
      throw new Error('Respuesta inválida al sincronizar apartados en Supabase.');
    }

    // Actualizar respaldo local con los datos remotos
    try {
      const backupKey = `${STORAGE_APARTADOS_KEY_PREFIX}${grupoId}`;
      localStorage.setItem(backupKey, JSON.stringify(data.calificacionesApartados));
    } catch (err) {
      console.warn('[calificacionesService] No se pudo actualizar el respaldo local con Supabase:', err);
    }

    return {
      success: true,
      actualizadas: typeof data.actualizadas === 'number' ? data.actualizadas : (contadorGuardadas + contadorRetiradas),
      guardadas: typeof data.guardadas === 'number' ? data.guardadas : contadorGuardadas,
      retiradas: typeof data.retiradas === 'number' ? data.retiradas : contadorRetiradas,
      calificacionesApartados: data.calificacionesApartados,
      origen: 'supabase',
    };
  } catch (err: any) {
    console.error('[calificacionesService] Error al guardar calificaciones de apartados:', err);
    const msg = err?.message || 'Error de conexión con Supabase.';
    throw new Error(`${msg}. Los cambios se han retenido en búfer local.`);
  }
}

/**
 * Recupera el respaldo local de apartados
 */
export function recuperarRespaldoCalificacionesApartados(grupoId: string): CalificacionApartado[] | null {
  try {
    const backupKey = `${STORAGE_APARTADOS_KEY_PREFIX}${grupoId}`;
    const item = localStorage.getItem(backupKey);
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignorar fallo de parseo
  }
  return null;
}

/**
 * Limpia el respaldo local de apartados
 */
export function limpiarRespaldoCalificacionesApartados(grupoId: string): void {
  try {
    const backupKey = `${STORAGE_APARTADOS_KEY_PREFIX}${grupoId}`;
    localStorage.removeItem(backupKey);
  } catch (err) {
    console.warn('[calificacionesService] No se pudo limpiar respaldo de apartados:', err);
  }
}

