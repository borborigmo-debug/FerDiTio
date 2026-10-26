/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCurrentIdToken } from './authService';
import { CuadernoGrupoData } from '../types';
import { recuperarRespaldoCalificacionesApartados, purgarActividadesDeRespaldoLocal } from './calificacionesService';
import { getRubricasEliminadasLocal } from './rubricasService';
import { compararCodigosCriterio } from '../utils/rubricaUtils';
import { fusionarCriteriosConOverlayLocal } from './criteriosStorageService';

export interface GrupoDocente {
  id: string;
  nombre: string;
  oculto?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GruposRespuesta {
  groups: GrupoDocente[];
  docente?: {
    id?: string;
    nombre?: string;
    email?: string;
    registrado?: boolean;
  };
  message?: string;
}

const SUPABASE_FUNCTIONS_BASE = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1';

/**
 * Consulta de forma segura los grupos del profesor autenticado en Firebase
 * a través de la Edge Function 'fernanditio-data'.
 */
export async function fetchGruposDocente(): Promise<GruposRespuesta> {
  // 1. Obtener token renovado de la sesión activa
  const token = await getCurrentIdToken(true);
  if (!token) {
    throw new Error('No existe una sesión de autenticación activa para consultar los grupos.');
  }

  // 2. Endpoint de lectura de grupos en Supabase
  const endpoint = `${SUPABASE_FUNCTIONS_BASE}/fernanditio-data/groups`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
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
        // Ignorar fallo de parseo si no es JSON
      }

      const error = new Error(detalleError);
      (error as any).status = response.status;
      throw error;
    }

    const data: GruposRespuesta = await response.json();
    return data;
  } catch (err: any) {
    if (err?.status) {
      throw err;
    }

    if (err instanceof TypeError || err?.message?.includes('fetch') || err?.message?.includes('Network')) {
      throw new Error(
        'Error de red o restricción CORS: No se pudo conectar con la Edge Function fernanditio-data. Verifique que la función esté desplegada y acepte peticiones desde este origen.'
      );
    }

    throw err;
  }
}

/**
 * Consulta de solo lectura de todas las entidades de un grupo autorizado
 * (alumnos, criterios, secciones, rúbricas, actividades con diagnóstico y calificaciones)
 * garantizando la verificación de propiedad en el servidor.
 */
export async function fetchCuadernoGrupo(
  grupoId: string,
  signal?: AbortSignal
): Promise<CuadernoGrupoData> {
  if (!grupoId || typeof grupoId !== 'string') {
    throw new Error('Identificador de grupo inválido para la consulta.');
  }

  const token = await getCurrentIdToken(false);
  if (!token) {
    throw new Error('No existe una sesión de autenticación activa para consultar el cuaderno.');
  }

  const encodedId = encodeURIComponent(grupoId);
  const endpoint = `${SUPABASE_FUNCTIONS_BASE}/fernanditio-data/cuaderno?grupoId=${encodedId}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      signal,
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
        // No es JSON
      }

      const error = new Error(detalleError);
      (error as any).status = response.status;
      throw error;
    }

    const data: any = await response.json();

    // 1. Verificación de objeto válido
    if (!data || typeof data !== 'object') {
      throw new Error('La respuesta del servidor no contiene un objeto JSON válido.');
    }

    // 2. Detección de incompatibilidad: la función remota solo devolvió { groups: [...] }
    if (Array.isArray(data.groups) && !data.grupo) {
      throw new Error(
        'La función remota de Supabase todavía no devuelve los datos del cuaderno (devolvió únicamente la lista de grupos). Es necesario actualizar y desplegar la Edge Function fernanditio-data en Supabase con la ruta /cuaderno para consultar los datos de este grupo.'
      );
    }

    // 3. Verificación de campos obligatorios del contrato CuadernoGrupoData
    if (!data.grupo || typeof data.grupo !== 'object' || !data.grupo.id) {
      throw new Error(
        'Estructura de respuesta incompatible: la respuesta no incluye la información obligatoria del grupo solicitado.'
      );
    }

    if (!Array.isArray(data.alumnos) || !Array.isArray(data.criterios)) {
      throw new Error(
        'Estructura de datos incompleta: la respuesta no incluye las listas obligatorias de alumnos o criterios.'
      );
    }

    const resultado = data as CuadernoGrupoData;

    // Filtrar rúbricas eliminadas localmente si la función remota todavía no las eliminó
    // Filtrar rúbricas eliminadas localmente y sus actividades asociadas
    const rubsEliminadas = getRubricasEliminadasLocal(resultado.grupo.id);
    if (rubsEliminadas.size > 0 && Array.isArray(resultado.rubricas)) {
      resultado.rubricas = resultado.rubricas.filter((r) => !rubsEliminadas.has(r.id));
      if (Array.isArray(resultado.actividades)) {
        resultado.actividades = resultado.actividades.filter(
          (a) => !a.rubrica_id || !rubsEliminadas.has(a.rubrica_id)
        );
      }
      if (resultado.estadisticas) {
        resultado.estadisticas.totalRubricas = resultado.rubricas.length;
        if (Array.isArray(resultado.actividades)) {
          resultado.estadisticas.totalActividades = resultado.actividades.length;
        }
      }
    }

    // Filtrar actividades eliminadas localmente si la función remota todavía no las eliminó
    const actsEliminadas = getActividadesEliminadasLocal(resultado.grupo.id);
    if (actsEliminadas.size > 0 && Array.isArray(resultado.actividades)) {
      resultado.actividades = resultado.actividades.filter((a) => !actsEliminadas.has(a.id));
      if (Array.isArray(resultado.calificaciones)) {
        resultado.calificaciones = resultado.calificaciones.filter((c) => !actsEliminadas.has(c.actividad_id));
      }
      if (Array.isArray(resultado.calificacionesApartados)) {
        resultado.calificacionesApartados = resultado.calificacionesApartados.filter(
          (ca) => !ca.actividad_id || !actsEliminadas.has(ca.actividad_id)
        );
      }
      if (resultado.estadisticas) {
        resultado.estadisticas.totalActividades = resultado.actividades.length;
      }
    }

    // Si la respuesta remota no incluye calificacionesApartados o está vacía,
    // comprobar si existe un respaldo local en este dispositivo para no perder calificaciones pendientes:
    if (!resultado.calificacionesApartados || resultado.calificacionesApartados.length === 0) {
      const respaldoLocal = recuperarRespaldoCalificacionesApartados(resultado.grupo.id);
      if (respaldoLocal && Array.isArray(respaldoLocal) && respaldoLocal.length > 0) {
        resultado.calificacionesApartados = respaldoLocal;
      } else if (!resultado.calificacionesApartados) {
        resultado.calificacionesApartados = [];
      }
    }

    // Orden cronológico para catálogo de rúbricas y actividades (empezando por la más reciente)
    const parseTime = (dateVal: any): number => {
      if (!dateVal) return 0;
      const parsed = new Date(dateVal).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    if (Array.isArray(resultado.rubricas)) {
      resultado.rubricas.sort((a, b) => {
        const timeA = parseTime(a.created_at) || parseTime((a as any).fecha);
        const timeB = parseTime(b.created_at) || parseTime((b as any).fecha);
        return timeB - timeA;
      });
    }

    if (Array.isArray(resultado.actividades)) {
      resultado.actividades.sort((a, b) => {
        const timeA = parseTime(a.created_at) || parseTime(a.fecha);
        const timeB = parseTime(b.created_at) || parseTime(b.fecha);
        return timeB - timeA;
      });
    }

    // Fusionar criterios y ponderaciones con el overlay local persistente
    resultado.criterios = fusionarCriteriosConOverlayLocal(
      resultado.grupo.id,
      resultado.criterios || []
    );

    return resultado;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }

    if (err?.status) {
      throw err;
    }

    if (err instanceof TypeError || err?.message?.includes('fetch') || err?.message?.includes('Network')) {
      throw new Error(
        'Error de red o restricción CORS al consultar los datos del grupo en la Edge Function.'
      );
    }

    throw err;
  }
}

const STORAGE_KEY_ACTIVIDADES_ELIMINADAS = 'fernanditio_actividades_eliminadas_';

export function getActividadesEliminadasLocal(grupoId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_ACTIVIDADES_ELIMINADAS}${grupoId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map(String));
      }
    }
  } catch (err) {
    console.warn('[gruposService] Error al leer actividades eliminadas localmente:', err);
  }
  return new Set();
}

export function registrarActividadesEliminadasLocal(grupoId: string, actividadIds: string[]): void {
  try {
    const current = getActividadesEliminadasLocal(grupoId);
    actividadIds.forEach((id) => current.add(String(id)));
    localStorage.setItem(
      `${STORAGE_KEY_ACTIVIDADES_ELIMINADAS}${grupoId}`,
      JSON.stringify(Array.from(current))
    );
  } catch (err) {
    console.warn('[gruposService] Error al registrar actividades eliminadas localmente:', err);
  }
}

/**
 * Elimina en lote actividades de un grupo autorizado en Supabase.
 * Envía la petición autenticada a la Edge Function 'fernanditio-data'.
 * Lanza un error descriptivo si el servidor falla o no implementa la operación;
 * no simula éxito en almacenamiento local ni disfraza errores.
 */
export async function eliminarActividadesLote(
  grupoId: string,
  actividadIds: string[]
): Promise<{ success: boolean; eliminadas: string[] }> {
  if (!grupoId || !Array.isArray(actividadIds) || actividadIds.length === 0) {
    throw new Error('Parámetros inválidos para eliminar actividades.');
  }

  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión autenticada activa para eliminar actividades.');
  }

  const endpoint = `${SUPABASE_FUNCTIONS_BASE}/fernanditio-data`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        tipo: 'eliminar_actividades',
        grupoId,
        actividadIds,
      }),
    });
  } catch (netErr: any) {
    throw new Error(`Error de conexión al intentar eliminar actividades: ${netErr?.message || netErr}`);
  }

  if (response.ok) {
    const data = await response.json();
    if (data?.success) {
      const eliminadas = data.eliminadas || actividadIds;
      registrarActividadesEliminadasLocal(grupoId, eliminadas);
      purgarActividadesDeRespaldoLocal(grupoId, eliminadas);
      return {
        success: true,
        eliminadas,
      };
    }
    throw new Error(data?.error || 'La operación en el servidor no devolvió confirmación de éxito.');
  } else {
    let detalle = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error) detalle = errJson.error;
    } catch {}

    if (
      detalle.includes('Se requiere al menos una calificación para guardar o retirar') ||
      detalle.includes('No se reconoce el tipo') ||
      response.status === 404 ||
      response.status === 501
    ) {
      throw new Error(
        `La Edge Function remota de Supabase aún no tiene desplegada la operación 'eliminar_actividades' (${detalle}). El cambio no se ha persistido en el servidor.`
      );
    }

    throw new Error(`Error al eliminar actividades en Supabase: ${detalle}`);
  }
}

