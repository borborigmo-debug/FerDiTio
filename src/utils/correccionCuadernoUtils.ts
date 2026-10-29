/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rubrica, ActividadDetalle, Seccion } from '../types';

export interface RubricaConMetadataFecha {
  rubrica: Rubrica;
  actividadAsociada?: ActividadDetalle;
  seccionAsociada?: Seccion;
  timestamp: number | null;
  fechaFormateada: string;
  origenFecha: 'actividad' | 'rubrica' | 'desconocido';
  esSugeridaCuaderno: boolean;
}

/**
 * Resuelve la fecha real más representativa para una rúbrica,
 * priorizando la fecha de la actividad asociada en el cuaderno y,
 * secundariamente, la fecha propia de la rúbrica o su marca de creación.
 * No inventa fechas ni deduce marcas a partir de identificadores.
 */
export function resolverFechaRubrica(
  rubrica: Rubrica,
  actividades: ActividadDetalle[]
): {
  timestamp: number | null;
  fechaFormateada: string;
  origen: 'actividad' | 'rubrica' | 'desconocido';
} {
  if (!rubrica) {
    return { timestamp: null, fechaFormateada: 'Sin fecha registrada', origen: 'desconocido' };
  }

  // Buscar actividades vinculadas a esta rúbrica
  const actividadesVinculadas = (actividades || []).filter((a) => a.rubrica_id === rubrica.id);
  const actPrincipal = actividadesVinculadas[0];

  // 1. Fecha explícita en actividad
  const fechaAct = actPrincipal?.fecha_creacion || actPrincipal?.fecha || actPrincipal?.created_at;
  if (fechaAct && typeof fechaAct === 'string') {
    const d = new Date(fechaAct);
    const ts = d.getTime();
    if (!isNaN(ts) && ts > 0) {
      return {
        timestamp: ts,
        fechaFormateada: d.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        origen: 'actividad',
      };
    }
  }

  // 2. Fecha explícita en la propia rúbrica
  const fechaRub = rubrica?.fecha_creacion || rubrica?.fecha || rubrica?.created_at;
  if (fechaRub && typeof fechaRub === 'string') {
    const d = new Date(fechaRub);
    const ts = d.getTime();
    if (!isNaN(ts) && ts > 0) {
      return {
        timestamp: ts,
        fechaFormateada: d.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        origen: 'rubrica',
      };
    }
  }

  return {
    timestamp: null,
    fechaFormateada: 'Sin fecha registrada',
    origen: 'desconocido',
  };
}

/**
 * Ordena un conjunto de rúbricas cronológicamente (de la más antigua a la más reciente),
 * deduplicando por identificador de rúbrica.
 * Aquellas rúbricas que no posean una fecha verificable se sitúan ordenadamente al final.
 */
export function prepararRubricasCronologicas(
  rubricas: Rubrica[],
  actividades: ActividadDetalle[],
  secciones: Seccion[]
): RubricaConMetadataFecha[] {
  if (!Array.isArray(rubricas) || rubricas.length === 0) {
    return [];
  }

  // Deduplicación determinista por ID de rúbrica
  const mapaUnicas = new Map<string, Rubrica>();
  for (const r of rubricas) {
    if (r && r.id && !mapaUnicas.has(r.id)) {
      mapaUnicas.set(r.id, r);
    }
  }

  const seccionesMap = new Map<string, Seccion>();
  (secciones || []).forEach((s) => {
    if (s && s.id) seccionesMap.set(s.id, s);
  });

  const actividadesMap = new Map<string, ActividadDetalle>();
  (actividades || []).forEach((a) => {
    if (a && a.rubrica_id && !actividadesMap.has(a.rubrica_id)) {
      actividadesMap.set(a.rubrica_id, a);
    }
  });

  const elementos: RubricaConMetadataFecha[] = Array.from(mapaUnicas.values()).map((rubrica) => {
    const act = actividadesMap.get(rubrica.id);
    const sec = act?.seccion_id ? seccionesMap.get(act.seccion_id) : undefined;
    const infoFecha = resolverFechaRubrica(rubrica, actividades);

    // Sugerencia de si evalúa cuaderno basada en relaciones existentes (sección, método o tipo)
    let esSugerida = false;
    if (sec && sec.nombre && sec.nombre.toLowerCase().includes('cuaderno')) {
      esSugerida = true;
    } else if (act?.tipo && act.tipo.toLowerCase().includes('cuaderno')) {
      esSugerida = true;
    } else if (act?.metodo && act.metodo.toLowerCase().includes('cuaderno')) {
      esSugerida = true;
    } else if (rubrica.tipo && rubrica.tipo.toLowerCase().includes('cuaderno')) {
      esSugerida = true;
    }

    return {
      rubrica,
      actividadAsociada: act,
      seccionAsociada: sec,
      timestamp: infoFecha.timestamp,
      fechaFormateada: infoFecha.fechaFormateada,
      origenFecha: infoFecha.origen,
      esSugeridaCuaderno: esSugerida,
    };
  });

  // Orden cronológico: más antigua a más reciente
  elementos.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null) {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp; // Ascendente (antigua -> reciente)
      }
      return (a.rubrica.titulo || '').localeCompare(b.rubrica.titulo || '');
    }
    if (a.timestamp !== null && b.timestamp === null) return -1;
    if (a.timestamp === null && b.timestamp !== null) return 1;
    return (a.rubrica.titulo || '').localeCompare(b.rubrica.titulo || '');
  });

  return elementos;
}
