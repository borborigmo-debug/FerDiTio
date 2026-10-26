/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Criterio } from '../types';
import { compararCodigosCriterio } from '../utils/rubricaUtils';
import { obtenerGruposVinculadosCon } from './vinculacionRubricasService';

const STORAGE_PREFIX_PONDERACIONES = 'fernanditio_criterios_ponderaciones_';
const STORAGE_PREFIX_CUSTOM = 'fernanditio_criterios_custom_';
const STORAGE_PREFIX_ELIMINADOS = 'fernanditio_criterios_eliminados_';

export interface PonderacionOverlayEntry {
  codigo: string;
  ponderacion: number | null;
  criterioId?: number;
  updatedAt: string;
}

/**
 * Normaliza un código de criterio para búsquedas e indexación sin ambigüedad (ej: " 1.1 " -> "1.1").
 */
export function normalizarCodigo(codigo: string): string {
  return (codigo || '').trim().toLowerCase();
}

/**
 * Obtiene el mapa de ponderaciones locales registradas para un grupo docente.
 * Las claves incluyen tanto el código normalizado ("1.1") como el ID numérico ("102") si está disponible.
 */
export function obtenerPonderacionesLocal(grupoId: string): Record<string, number | null> {
  if (!grupoId) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_PONDERACIONES}${grupoId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.warn(`[criteriosStorageService] Error al leer ponderaciones locales de grupo ${grupoId}:`, err);
  }
  return {};
}

/**
 * Guarda o actualiza la ponderación de un criterio en el almacenamiento local persistente del grupo.
 * Si se indica `profesorUid` y `propagarVinculados: true`, replica automáticamente la ponderación
 * en todos los grupos vinculados al cluster del docente.
 */
export function guardarPonderacionLocal(
  grupoId: string,
  criterioId: number | undefined,
  codigo: string,
  ponderacion: number | null,
  profesorUid?: string,
  propagarVinculados: boolean = true
): void {
  if (!grupoId || !codigo) return;
  const codNorm = normalizarCodigo(codigo);
  const pondVal = ponderacion !== null && ponderacion !== undefined && !isNaN(ponderacion) ? ponderacion : null;

  try {
    const key = `${STORAGE_PREFIX_PONDERACIONES}${grupoId}`;
    const actuales = obtenerPonderacionesLocal(grupoId);

    actuales[codNorm] = pondVal;
    if (criterioId !== undefined && criterioId !== null) {
      actuales[String(criterioId)] = pondVal;
    }

    localStorage.setItem(key, JSON.stringify(actuales));

    // Si también existe en custom criteria locales, actualizarlo
    const customList = obtenerCriteriosLocales(grupoId);
    let modificadoCustom = false;
    const nuevaCustomList = customList.map((c) => {
      if (normalizarCodigo(c.codigo) === codNorm || (criterioId && c.id === criterioId)) {
        modificadoCustom = true;
        return { ...c, ponderacion: pondVal };
      }
      return c;
    });
    if (modificadoCustom) {
      guardarCriteriosLocales(grupoId, nuevaCustomList);
    }

    // Propagar a grupos vinculados si procede
    if (propagarVinculados) {
      const vinculadosIds = obtenerGruposVinculadosCon(grupoId, profesorUid);
      for (const vincId of vinculadosIds) {
        guardarPonderacionLocal(vincId, undefined, codigo, pondVal, profesorUid, false);
      }
    }
  } catch (err) {
    console.warn(`[criteriosStorageService] Error al guardar ponderación local para grupo ${grupoId}:`, err);
  }
}

/**
 * Guarda en lote un conjunto de ponderaciones para el grupo y opcionalmente sus grupos vinculados.
 */
export function guardarPonderacionesLoteLocal(
  grupoId: string,
  items: Array<{ criterioId?: number; codigo: string; ponderacion: number | null }>,
  profesorUid?: string,
  propagarVinculados: boolean = true
): void {
  if (!grupoId || !Array.isArray(items) || items.length === 0) return;

  try {
    const key = `${STORAGE_PREFIX_PONDERACIONES}${grupoId}`;
    const actuales = obtenerPonderacionesLocal(grupoId);

    for (const it of items) {
      if (!it.codigo) continue;
      const codNorm = normalizarCodigo(it.codigo);
      const pondVal = it.ponderacion !== null && it.ponderacion !== undefined && !isNaN(it.ponderacion) ? it.ponderacion : null;
      actuales[codNorm] = pondVal;
      if (it.criterioId !== undefined && it.criterioId !== null) {
        actuales[String(it.criterioId)] = pondVal;
      }
    }

    localStorage.setItem(key, JSON.stringify(actuales));

    if (propagarVinculados) {
      const vinculadosIds = obtenerGruposVinculadosCon(grupoId, profesorUid);
      for (const vincId of vinculadosIds) {
        guardarPonderacionesLoteLocal(vincId, items, profesorUid, false);
      }
    }
  } catch (err) {
    console.warn(`[criteriosStorageService] Error guardando lote de ponderaciones locales en ${grupoId}:`, err);
  }
}

/**
 * Obtiene los criterios creados o editados localmente que todavía no han sido consolidados remotamente.
 */
export function obtenerCriteriosLocales(grupoId: string): Criterio[] {
  if (!grupoId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_CUSTOM}${grupoId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn(`[criteriosStorageService] Error al leer criterios custom locales de ${grupoId}:`, err);
  }
  return [];
}

/**
 * Guarda o actualiza un criterio en la lista local de criterios del grupo.
 */
export function guardarCriterioLocal(
  grupoId: string,
  criterio: Criterio,
  profesorUid?: string,
  propagarVinculados: boolean = true
): void {
  if (!grupoId || !criterio) return;
  const lista = obtenerCriteriosLocales(grupoId);
  const codNorm = normalizarCodigo(criterio.codigo);

  const idx = lista.findIndex(
    (c) => normalizarCodigo(c.codigo) === codNorm || (criterio.id && c.id === criterio.id)
  );

  let nuevaLista: Criterio[];
  if (idx >= 0) {
    nuevaLista = [...lista];
    nuevaLista[idx] = { ...nuevaLista[idx], ...criterio };
  } else {
    nuevaLista = [...lista, criterio];
  }

  guardarCriteriosLocales(grupoId, nuevaLista);

  // Guardar también la ponderación
  guardarPonderacionLocal(
    grupoId,
    criterio.id,
    criterio.codigo,
    criterio.ponderacion ?? null,
    profesorUid,
    propagarVinculados
  );

  // Si procede, propagar el criterio a los vinculados
  if (propagarVinculados) {
    const vinculadosIds = obtenerGruposVinculadosCon(grupoId, profesorUid);
    for (const vincId of vinculadosIds) {
      guardarCriterioLocal(
        vincId,
        {
          ...criterio,
          id: criterio.id ? -Math.abs(criterio.id) : -Math.abs(Date.now()),
          grupo_id: vincId,
        },
        profesorUid,
        false
      );
    }
  }
}

/**
 * Guarda la lista de criterios locales de un grupo.
 */
export function guardarCriteriosLocales(grupoId: string, criterios: Criterio[]): void {
  if (!grupoId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX_CUSTOM}${grupoId}`, JSON.stringify(criterios));
  } catch (err) {
    console.warn(`[criteriosStorageService] Error al guardar lista de criterios locales en ${grupoId}:`, err);
  }
}

/**
 * Registra criterios eliminados localmente para que no vuelvan a aparecer tras consultar Supabase.
 */
export function registrarCriteriosEliminadosLocal(
  grupoId: string,
  criterioIds: number[],
  codigos?: string[]
): void {
  if (!grupoId) return;
  try {
    const key = `${STORAGE_PREFIX_ELIMINADOS}${grupoId}`;
    const actuales = obtenerCriteriosEliminadosLocal(grupoId);

    for (const id of criterioIds) {
      actuales.add(String(id));
    }
    if (Array.isArray(codigos)) {
      for (const cod of codigos) {
        if (cod) actuales.add(normalizarCodigo(cod));
      }
    }

    localStorage.setItem(key, JSON.stringify(Array.from(actuales)));

    // Eliminar también de custom locales
    const custom = obtenerCriteriosLocales(grupoId);
    const idSet = new Set(criterioIds);
    const codSet = new Set((codigos || []).map(normalizarCodigo));
    const filtrados = custom.filter(
      (c) => !idSet.has(c.id) && !codSet.has(normalizarCodigo(c.codigo))
    );
    guardarCriteriosLocales(grupoId, filtrados);
  } catch (err) {
    console.warn(`[criteriosStorageService] Error al registrar eliminación local en ${grupoId}:`, err);
  }
}

/**
 * Obtiene el conjunto de identificadores y códigos eliminados localmente para un grupo.
 */
export function obtenerCriteriosEliminadosLocal(grupoId: string): Set<string> {
  if (!grupoId) return new Set();
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_ELIMINADOS}${grupoId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(String));
    }
  } catch (err) {
    console.warn(`[criteriosStorageService] Error al leer eliminados locales de ${grupoId}:`, err);
  }
  return new Set();
}

/**
 * FUSIONA los criterios devueltos por Supabase con la capa persistente local:
 * 1. Filtra criterios marcados como eliminados localmente.
 * 2. Restaura las ponderaciones guardadas localmente (por código y por ID),
 *    evitando que un 'null' devuelto por Supabase borre las ponderaciones del usuario.
 * 3. Incorpora criterios creados localmente que aún no figuran en la respuesta remota.
 * 4. Si el grupo está vinculado a un cluster y un criterio no tiene ponderación local propia,
 *    consulta si algún grupo vinculado del mismo cluster tiene ya definida esa ponderación para heredarla.
 * 5. Ordena los criterios garantizando el orden pedagógico oficial (10.1 y 10.2 al final).
 */
export function fusionarCriteriosConOverlayLocal(
  grupoId: string,
  criteriosRemotos: Criterio[],
  profesorUid?: string
): Criterio[] {
  if (!grupoId) return Array.isArray(criteriosRemotos) ? criteriosRemotos : [];

  const eliminadosSet = obtenerCriteriosEliminadosLocal(grupoId);
  const pondLocales = obtenerPonderacionesLocal(grupoId);
  const customLocales = obtenerCriteriosLocales(grupoId);

  // Obtener también ponderaciones de grupos vinculados como fallback colaborativo
  const vinculadosIds = obtenerGruposVinculadosCon(grupoId, profesorUid);
  const pondVinculadosFallback: Record<string, number | null> = {};
  for (const vId of vinculadosIds) {
    const pondV = obtenerPonderacionesLocal(vId);
    for (const [k, v] of Object.entries(pondV)) {
      if (v !== null && v !== undefined && pondVinculadosFallback[k] === undefined) {
        pondVinculadosFallback[k] = v;
      }
    }
  }

  // 1. Procesar criterios remotos
  const resultado: Criterio[] = [];
  const codigosVistos = new Set<string>();

  const baseRemotos = Array.isArray(criteriosRemotos) ? criteriosRemotos : [];

  for (const cr of baseRemotos) {
    if (!cr || !cr.codigo) continue;
    const codNorm = normalizarCodigo(cr.codigo);
    const idStr = String(cr.id);

    // Si fue eliminado localmente, omitir
    if (eliminadosSet.has(idStr) || eliminadosSet.has(codNorm)) {
      continue;
    }

    codigosVistos.add(codNorm);

    // Determinar la ponderación definitiva:
    // Prioridad 1: Ponderación explícita en el overlay local del grupo
    // Prioridad 2: Ponderación remota si no es nula
    // Prioridad 3: Ponderación heredada de un grupo vinculado del mismo docente
    let pondFinal = cr.ponderacion;

    if (pondLocales[codNorm] !== undefined) {
      pondFinal = pondLocales[codNorm];
    } else if (pondLocales[idStr] !== undefined) {
      pondFinal = pondLocales[idStr];
    } else if (cr.ponderacion === null || cr.ponderacion === undefined) {
      if (pondVinculadosFallback[codNorm] !== undefined && pondVinculadosFallback[codNorm] !== null) {
        pondFinal = pondVinculadosFallback[codNorm];
        // Guardar automáticamente para fijarlo en este grupo
        guardarPonderacionLocal(grupoId, cr.id, cr.codigo, pondFinal, profesorUid, false);
      }
    }

    // Comprobar si hay descripción actualizada en custom locales
    const customMatch = customLocales.find(
      (c) => normalizarCodigo(c.codigo) === codNorm || c.id === cr.id
    );

    resultado.push({
      ...cr,
      descripcion: customMatch?.descripcion || cr.descripcion,
      ponderacion: pondFinal,
    });
  }

  // 2. Incorporar criterios dados de alta localmente que aún no figuran remotamente
  for (const custom of customLocales) {
    if (!custom || !custom.codigo) continue;
    const codNorm = normalizarCodigo(custom.codigo);
    const idStr = String(custom.id);

    if (eliminadosSet.has(idStr) || eliminadosSet.has(codNorm)) {
      continue;
    }

    if (!codigosVistos.has(codNorm)) {
      codigosVistos.add(codNorm);
      const pondFinal = pondLocales[codNorm] ?? custom.ponderacion ?? null;
      resultado.push({
        ...custom,
        ponderacion: pondFinal,
      });
    }
  }

  // 3. Ordenar conforme a la norma de la asignatura
  resultado.sort((a, b) => compararCodigosCriterio(a.codigo, b.codigo));

  return resultado;
}
