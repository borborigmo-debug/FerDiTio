/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateUuid } from '../utils/rubricaUtils';
import { crearRubricaYActividad } from './rubricasService';
import { EvaluacionPeriodo } from '../context/CuadernoContext';

export interface ClusterVinculacionRubricas {
  id: string;
  nombre: string;
  grupoIds: string[];
  fechaCreacion: string;
}

const STORAGE_PREFIX = 'fernanditio_vinculacion_rubricas_';

/**
 * Obtiene los grupos o clusters de vinculación de rúbricas guardados para el docente.
 */
export function obtenerClustersVinculacion(profesorUid?: string): ClusterVinculacionRubricas[] {
  const keysToTry = profesorUid
    ? [`${STORAGE_PREFIX}${profesorUid}`, `${STORAGE_PREFIX}global`]
    : [`${STORAGE_PREFIX}global`];

  for (const key of keysToTry) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(
            (c) => c && typeof c.id === 'string' && Array.isArray(c.grupoIds)
          );
        }
      }
    } catch (err) {
      console.warn('[vinculacionRubricasService] Error al leer clusters de localStorage:', err);
    }
  }
  return [];
}

/**
 * Guarda la lista completa de clusters de vinculación para el docente.
 */
export function guardarClustersVinculacion(
  clusters: ClusterVinculacionRubricas[],
  profesorUid?: string
): void {
  const key = `${STORAGE_PREFIX}${profesorUid || 'global'}`;
  try {
    localStorage.setItem(key, JSON.stringify(clusters));
  } catch (err) {
    console.warn('[vinculacionRubricasService] Error al guardar clusters en localStorage:', err);
  }
}

/**
 * Devuelve los IDs de los grupos vinculados con un grupo dado (excluyendo el propio grupoId).
 */
export function obtenerGruposVinculadosCon(
  grupoId: string,
  profesorUid?: string
): string[] {
  if (!grupoId) return [];
  const clusters = obtenerClustersVinculacion(profesorUid);
  const vinculados = new Set<string>();

  for (const cluster of clusters) {
    if (cluster.grupoIds.includes(grupoId)) {
      for (const gid of cluster.grupoIds) {
        if (gid !== grupoId) {
          vinculados.add(gid);
        }
      }
    }
  }

  return Array.from(vinculados);
}

/**
 * Crea o actualiza un cluster de vinculación.
 */
export function guardarCluster(
  cluster: ClusterVinculacionRubricas,
  profesorUid?: string
): ClusterVinculacionRubricas[] {
  const clusters = obtenerClustersVinculacion(profesorUid);
  const index = clusters.findIndex((c) => c.id === cluster.id);

  let actualizados: ClusterVinculacionRubricas[];
  if (index >= 0) {
    actualizados = [...clusters];
    actualizados[index] = cluster;
  } else {
    actualizados = [...clusters, cluster];
  }

  guardarClustersVinculacion(actualizados, profesorUid);
  return actualizados;
}

/**
 * Elimina un cluster de vinculación por su ID.
 */
export function eliminarCluster(
  clusterId: string,
  profesorUid?: string
): ClusterVinculacionRubricas[] {
  const clusters = obtenerClustersVinculacion(profesorUid);
  const actualizados = clusters.filter((c) => c.id !== clusterId);
  guardarClustersVinculacion(actualizados, profesorUid);
  return actualizados;
}

/**
 * Limpia un grupo eliminado de todos los clusters existentes.
 */
export function eliminarGrupoDeVinculaciones(
  grupoId: string,
  profesorUid?: string
): void {
  const clusters = obtenerClustersVinculacion(profesorUid);
  const actualizados = clusters
    .map((c) => ({
      ...c,
      grupoIds: c.grupoIds.filter((gid) => gid !== grupoId),
    }))
    .filter((c) => c.grupoIds.length > 0);

  guardarClustersVinculacion(actualizados, profesorUid);
}

export interface ReplicacionResultado {
  grupoId: string;
  grupoNombre: string;
  success: boolean;
  error?: string;
}

export interface DatosRubricaReplicar {
  titulo: string;
  tipoRubrica: 'ACTIVIDAD' | 'TRABAJO' | 'EXAMEN';
  evaluacionPeriodo: EvaluacionPeriodo;
  descripcion: string | null;
  fechaCreacion?: string | null;
  items: Array<{
    id?: string;
    numero: string;
    titulo: string;
    peso: number | null;
    criterios: string[];
    descriptores?: {
      '1': string;
      '2': string;
      '3': string;
      '4': string;
    };
  }>;
}

/**
 * Replica una rúbrica en los grupos destino vinculados, generando UUIDs únicos para
 * cada apartado en cada grupo y creando tanto la rúbrica como su actividad vinculada en Supabase.
 */
export async function replicarRubricaEnGrupos(
  datos: DatosRubricaReplicar,
  targetGrupos: Array<{ id: string; nombre: string }>
): Promise<ReplicacionResultado[]> {
  const resultados: ReplicacionResultado[] = [];

  for (const target of targetGrupos) {
    try {
      // Regenerar UUIDs únicos e independientes para los apartados de este grupo
      const itemsConNuevosUuids = datos.items.map((item) => ({
        ...item,
        id: generateUuid().toLowerCase(),
      }));

      await crearRubricaYActividad({
        grupoId: target.id,
        titulo: datos.titulo,
        tipoRubrica: datos.tipoRubrica,
        evaluacionPeriodo: datos.evaluacionPeriodo,
        seccionId: null, // Para los grupos vinculados, no se asume misma sección
        descripcion: datos.descripcion,
        fechaCreacion: datos.fechaCreacion,
        items: itemsConNuevosUuids,
      });

      resultados.push({
        grupoId: target.id,
        grupoNombre: target.nombre,
        success: true,
      });
    } catch (err: any) {
      console.error(`[vinculacionRubricasService] Error al replicar en grupo ${target.nombre}:`, err);
      resultados.push({
        grupoId: target.id,
        grupoNombre: target.nombre,
        success: false,
        error: err?.message || 'Error al persistir la rúbrica en el grupo vinculado',
      });
    }
  }

  return resultados;
}
