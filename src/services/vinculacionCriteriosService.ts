/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Criterio } from '../types';
import {
  crearCriterio,
  actualizarCriterio,
  actualizarPonderacionCriterio,
} from './gestionDatosService';
import { fetchCuadernoGrupo } from './gruposService';
import { obtenerGruposVinculadosCon } from './vinculacionRubricasService';
import {
  guardarPonderacionLocal,
  guardarCriterioLocal,
} from './criteriosStorageService';

export { obtenerGruposVinculadosCon };

export interface ResultadoSincronizacionGrupo {
  grupoId: string;
  grupoNombre: string;
  success: boolean;
  actualizados: number;
  creados: number;
  error?: string;
}

export interface OpcionesSincronizacionCriterios {
  actualizarPonderacion?: boolean;
  actualizarDescripcion?: boolean;
  crearFaltantes?: boolean;
}

/**
 * Sincroniza la lista completa de criterios (códigos, descripciones y ponderaciones)
 * desde un grupo de origen hacia uno o varios grupos vinculados.
 *
 * Para cada grupo destino:
 * - Si un criterio ya existe (mismo código): actualiza su ponderación y/o descripción.
 * - Si un criterio no existe aún: lo da de alta con sus datos y ponderación correspondientes.
 * - Preserva cualquier otro dato del grupo destino (operación no destructiva).
 */
export async function sincronizarCriteriosConGruposVinculados(
  origenGrupoId: string,
  origenCriterios: Criterio[],
  targetGrupos: Array<{ id: string; nombre: string }>,
  opciones: OpcionesSincronizacionCriterios = {
    actualizarPonderacion: true,
    actualizarDescripcion: true,
    crearFaltantes: true,
  }
): Promise<ResultadoSincronizacionGrupo[]> {
  const resultados: ResultadoSincronizacionGrupo[] = [];

  if (!origenGrupoId || !Array.isArray(origenCriterios) || origenCriterios.length === 0) {
    return resultados;
  }

  for (const target of targetGrupos) {
    if (target.id === origenGrupoId) continue;

    let actualizados = 0;
    let creados = 0;

    try {
      // 1. Obtener los criterios existentes en el grupo destino
      const targetCuaderno = await fetchCuadernoGrupo(target.id);
      const targetCriterios = targetCuaderno?.criterios || [];

      // Mapear criterios destino por código normalizado
      const mapTargetPorCodigo = new Map<string, Criterio>();
      for (const cr of targetCriterios) {
        if (cr && cr.codigo) {
          mapTargetPorCodigo.set(cr.codigo.trim().toLowerCase(), cr);
        }
      }

      // 2. Procesar cada criterio del grupo de origen
      for (const critOrigen of origenCriterios) {
        const codNormalizado = critOrigen.codigo.trim().toLowerCase();
        const existingTarget = mapTargetPorCodigo.get(codNormalizado);

        if (existingTarget) {
          // Ya existe en el grupo destino: comprobar si hay cambios en ponderación o descripción
          const pondOrigen =
            critOrigen.ponderacion !== null && critOrigen.ponderacion !== undefined
              ? critOrigen.ponderacion
              : null;
          const pondTarget =
            existingTarget.ponderacion !== null && existingTarget.ponderacion !== undefined
              ? existingTarget.ponderacion
              : null;

          const descOrigen = (critOrigen.descripcion || '').trim();
          const descTarget = (existingTarget.descripcion || '').trim();

          const debeActualizarPond = opciones.actualizarPonderacion && pondOrigen !== pondTarget;
          const debeActualizarDesc = opciones.actualizarDescripcion && descOrigen !== descTarget;

          if (debeActualizarPond || debeActualizarDesc) {
            const finalPond = debeActualizarPond ? pondOrigen : pondTarget;
            const finalDesc = debeActualizarDesc ? descOrigen : descTarget;

            guardarPonderacionLocal(target.id, existingTarget.id, existingTarget.codigo, finalPond, undefined, false);
            guardarCriterioLocal(
              target.id,
              {
                id: existingTarget.id,
                codigo: existingTarget.codigo,
                descripcion: finalDesc,
                ponderacion: finalPond,
                grupo_id: target.id,
              },
              undefined,
              false
            );

            await actualizarCriterio(
              target.id,
              existingTarget.id,
              existingTarget.codigo,
              finalDesc,
              finalPond
            );
            actualizados++;
          }
        } else if (opciones.crearFaltantes) {
          // No existe en el grupo destino: crearlo
          const pondOrigen =
            critOrigen.ponderacion !== null && critOrigen.ponderacion !== undefined
              ? critOrigen.ponderacion
              : null;

          guardarPonderacionLocal(target.id, undefined, critOrigen.codigo, pondOrigen, undefined, false);

          await crearCriterio(
            target.id,
            critOrigen.codigo.trim(),
            (critOrigen.descripcion || '').trim(),
            pondOrigen
          );
          creados++;
        }
      }

      resultados.push({
        grupoId: target.id,
        grupoNombre: target.nombre,
        success: true,
        actualizados,
        creados,
      });
    } catch (err: any) {
      console.error(
        `[vinculacionCriteriosService] Error al sincronizar con grupo ${target.nombre}:`,
        err
      );
      resultados.push({
        grupoId: target.id,
        grupoNombre: target.nombre,
        success: false,
        actualizados,
        creados,
        error: err?.message || 'Error al comunicar con Supabase para el grupo vinculado',
      });
    }
  }

  return resultados;
}

/**
 * Replica el cambio de ponderación de un único criterio específico en todos los grupos vinculados.
 * Busca el criterio por su código en cada grupo destino y actualiza su ponderación.
 */
export async function replicarPonderacionEnGruposVinculados(
  codigo: string,
  ponderacion: number | null,
  targetGrupos: Array<{ id: string; nombre: string }>
): Promise<Array<{ grupoId: string; grupoNombre: string; success: boolean; criterioEncontrado: boolean }>> {
  const cleanCod = (codigo || '').trim().toLowerCase();
  if (!cleanCod || targetGrupos.length === 0) return [];

  const resultados = [];

  for (const target of targetGrupos) {
    try {
      // Guardar de inmediato en el almacenamiento local persistente del grupo vinculado
      guardarPonderacionLocal(target.id, undefined, cleanCod, ponderacion, undefined, false);

      const targetCuaderno = await fetchCuadernoGrupo(target.id);
      const targetCriterios = targetCuaderno?.criterios || [];
      const match = targetCriterios.find((c) => c.codigo.trim().toLowerCase() === cleanCod);

      if (match) {
        guardarPonderacionLocal(target.id, match.id, match.codigo, ponderacion, undefined, false);
        await actualizarPonderacionCriterio(
          target.id,
          match.id,
          ponderacion,
          match.codigo,
          match.descripcion
        );
        resultados.push({
          grupoId: target.id,
          grupoNombre: target.nombre,
          success: true,
          criterioEncontrado: true,
        });
      } else {
        resultados.push({
          grupoId: target.id,
          grupoNombre: target.nombre,
          success: true,
          criterioEncontrado: false,
        });
      }
    } catch (err: any) {
      console.warn(
        `[vinculacionCriteriosService] No se pudo replicar ponderación en ${target.nombre}:`,
        err
      );
      resultados.push({
        grupoId: target.id,
        grupoNombre: target.nombre,
        success: false,
        criterioEncontrado: false,
      });
    }
  }

  return resultados;
}

/**
 * Replica la creación o actualización completa de un criterio en los grupos vinculados.
 */
export async function replicarCriterioEnGruposVinculados(
  criterioOrCodigo: { codigo: string; descripcion: string; ponderacion?: number | null } | string,
  targetGruposOrDesc: Array<{ id: string; nombre: string }> | string,
  ponderacionArg?: number | null,
  targetGruposArg?: Array<{ id: string; nombre: string }>
): Promise<Array<{ grupoId: string; grupoNombre: string; accion: 'creado' | 'actualizado' | 'error'; success: boolean }>> {
  let codigo = '';
  let descripcion = '';
  let ponderacion: number | null = null;
  let targetGrupos: Array<{ id: string; nombre: string }> = [];

  if (typeof criterioOrCodigo === 'object' && criterioOrCodigo !== null) {
    codigo = criterioOrCodigo.codigo;
    descripcion = criterioOrCodigo.descripcion;
    ponderacion = criterioOrCodigo.ponderacion ?? null;
    targetGrupos = Array.isArray(targetGruposOrDesc) ? targetGruposOrDesc : [];
  } else {
    codigo = String(criterioOrCodigo || '');
    descripcion = typeof targetGruposOrDesc === 'string' ? targetGruposOrDesc : '';
    ponderacion = ponderacionArg ?? null;
    targetGrupos = Array.isArray(targetGruposArg) ? targetGruposArg : [];
  }

  const cleanCod = (codigo || '').trim();
  const cleanCodLower = cleanCod.toLowerCase();
  const cleanDesc = (descripcion || '').trim();
  const pondVal = ponderacion;

  if (!cleanCod || targetGrupos.length === 0) return [];

  const resultados = [];

  for (const target of targetGrupos) {
    try {
      const targetCuaderno = await fetchCuadernoGrupo(target.id);
      const targetCriterios = targetCuaderno?.criterios || [];
      const match = targetCriterios.find((c) => c.codigo.trim().toLowerCase() === cleanCodLower);

      if (match) {
        await actualizarCriterio(target.id, match.id, cleanCod, cleanDesc, pondVal);
        resultados.push({
          grupoId: target.id,
          grupoNombre: target.nombre,
          accion: 'actualizado' as const,
          success: true,
        });
      } else {
        await crearCriterio(target.id, cleanCod, cleanDesc, pondVal);
        resultados.push({
          grupoId: target.id,
          grupoNombre: target.nombre,
          accion: 'creado' as const,
          success: true,
        });
      }
    } catch (err: any) {
      console.warn(
        `[vinculacionCriteriosService] Error al replicar criterio en ${target.nombre}:`,
        err
      );
      resultados.push({
        grupoId: target.id,
        grupoNombre: target.nombre,
        accion: 'error' as const,
        success: false,
      });
    }
  }

  return resultados;
}
