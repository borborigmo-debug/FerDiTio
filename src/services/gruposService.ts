/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCurrentIdToken } from './authService';
import { CuadernoGrupoData } from '../types';
import { recuperarRespaldoCalificacionesApartados } from './calificacionesService';

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
