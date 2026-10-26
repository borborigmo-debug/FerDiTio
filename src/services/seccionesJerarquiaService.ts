import { Seccion } from '../types';
import { compararSecciones } from '../utils/rubricaUtils';

const STORAGE_PREFIX = 'fernanditio_secciones_jerarquia_';

export interface ArbolSeccionItem {
  seccion: Seccion;
  subsecciones: Seccion[];
}

/**
 * Obtiene el mapa de jerarquía de subsecciones para un grupo específico.
 * Devuelve un diccionario donde la clave es el ID de la subsección y el valor es el ID de la sección padre.
 */
export function getSeccionesJerarquia(grupoId: string): Record<string, string> {
  if (!grupoId) return {};
  const key = `${STORAGE_PREFIX}${grupoId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
    }
  } catch (err) {
    console.warn('[seccionesJerarquiaService] Error al leer jerarquía de secciones:', err);
  }
  return {};
}

/**
 * Establece o actualiza la sección padre de una subsección.
 */
export function setSeccionParent(
  grupoId: string,
  subseccionId: string,
  parentId: string | null
): void {
  if (!grupoId || !subseccionId) return;
  const key = `${STORAGE_PREFIX}${grupoId}`;
  const mapa = getSeccionesJerarquia(grupoId);

  if (parentId) {
    mapa[subseccionId] = parentId;
  } else {
    delete mapa[subseccionId];
  }

  try {
    localStorage.setItem(key, JSON.stringify(mapa));
    window.dispatchEvent(
      new CustomEvent('fernanditio:secciones-jerarquia-actualizada', {
        detail: { grupoId, mapa },
      })
    );
  } catch (err) {
    console.error('[seccionesJerarquiaService] Error al guardar jerarquía:', err);
  }
}

/**
 * Elimina una sección o subsección de la jerarquía (limpia referencias huérfanas).
 */
export function eliminarDeJerarquia(grupoId: string, seccionId: string): void {
  if (!grupoId || !seccionId) return;
  const key = `${STORAGE_PREFIX}${grupoId}`;
  const mapa = getSeccionesJerarquia(grupoId);

  // 1. Eliminar si ella misma era subsección
  delete mapa[seccionId];

  // 2. Si era padre, desvincular a todas sus hijas
  for (const [subId, pId] of Object.entries(mapa)) {
    if (pId === seccionId) {
      delete mapa[subId];
    }
  }

  try {
    localStorage.setItem(key, JSON.stringify(mapa));
    window.dispatchEvent(
      new CustomEvent('fernanditio:secciones-jerarquia-actualizada', {
        detail: { grupoId, mapa },
      })
    );
  } catch (err) {
    console.error('[seccionesJerarquiaService] Error al limpiar jerarquía:', err);
  }
}

/**
 * Organiza la lista plana de secciones de un grupo en un árbol de secciones principales
 * y sus correspondientes subsecciones anidadas.
 */
export function organizarArbolSecciones(
  secciones: Seccion[],
  grupoId: string
): ArbolSeccionItem[] {
  if (!Array.isArray(secciones) || secciones.length === 0) {
    return [];
  }

  const mapa = getSeccionesJerarquia(grupoId);
  const seccionMap = new Map<string, Seccion>();
  secciones.forEach((s) => seccionMap.set(s.id, s));

  // Identificar cuáles son subsecciones válidas (su padre existe en la lista actual)
  const subseccionesSet = new Set<string>();
  const hijosPorPadre = new Map<string, Seccion[]>();

  for (const seccion of secciones) {
    const parentId = mapa[seccion.id];
    if (parentId && seccionMap.has(parentId) && parentId !== seccion.id) {
      subseccionesSet.add(seccion.id);
      const lista = hijosPorPadre.get(parentId) || [];
      lista.push(seccion);
      hijosPorPadre.set(parentId, lista);
    }
  }

  // Las secciones principales son las que no son subsecciones de otra existente
  const principales = [...secciones.filter((s) => !subseccionesSet.has(s.id))].sort(compararSecciones);

  return principales.map((padre) => {
    const subs = [...(hijosPorPadre.get(padre.id) || [])].sort(compararSecciones);
    return {
      seccion: padre,
      subsecciones: subs,
    };
  });
}
