/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rubrica, RubricaItem } from '../types';

export interface NormalizedRubricaItem {
  id: string;
  numero: string;
  titulo: string;
  peso: number | null;
  criterios: string[];
  descriptores: Record<string, string>;
  raw: any;
}

export interface NormalizedRubrica {
  id: string;
  grupo_id: string;
  titulo: string;
  tipo: string;
  descripcion: string | null;
  items: NormalizedRubricaItem[];
  niveles: string[];
  sumaPesos: number | null;
  criteriosUnicos: string[];
  raw: Rubrica;
}

/**
 * Parsea de forma segura el campo items de una rúbrica,
 * soportando arrays, cadenas JSON o diccionarios.
 */
export function parseRubricaItems(rawItems: any): any[] {
  if (!rawItems) return [];
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.values(parsed);
    } catch {
      return [];
    }
  }
  if (typeof rawItems === 'object') {
    return Object.values(rawItems);
  }
  return [];
}

/**
 * Extrae el diccionario de descriptores { nivel: texto } para un apartado
 * adaptándose a múltiples estructuras posibles de datos.
 */
export function extractItemDescriptores(item: any): Record<string, string> {
  if (!item || typeof item !== 'object') return {};

  const result: Record<string, string> = {};

  // Caso 1: Objeto explícito descriptores
  if (item.descriptores && typeof item.descriptores === 'object') {
    if (Array.isArray(item.descriptores)) {
      item.descriptores.forEach((d: any, index: number) => {
        if (typeof d === 'string') {
          result[String(index + 1)] = d;
        } else if (d && typeof d === 'object') {
          const key = String(d.nivel ?? d.level ?? d.puntos ?? index + 1);
          const val = String(d.descripcion ?? d.texto ?? d.descriptor ?? d.valor ?? '');
          if (val) result[key] = val;
        }
      });
    } else {
      for (const [key, val] of Object.entries(item.descriptores)) {
        if (typeof val === 'string') {
          result[key] = val;
        } else if (val && typeof val === 'object') {
          const subText = (val as any).texto ?? (val as any).descripcion ?? JSON.stringify(val);
          result[key] = String(subText);
        } else if (val !== null && val !== undefined) {
          result[key] = String(val);
        }
      }
    }
  }

  // Caso 2: Objeto niveles
  if (Object.keys(result).length === 0 && item.niveles && typeof item.niveles === 'object') {
    if (Array.isArray(item.niveles)) {
      item.niveles.forEach((n: any, index: number) => {
        if (typeof n === 'string') {
          result[String(index + 1)] = n;
        } else if (n && typeof n === 'object') {
          const key = String(n.nivel ?? n.level ?? index + 1);
          const val = String(n.descripcion ?? n.texto ?? n.descriptor ?? '');
          if (val) result[key] = val;
        }
      });
    } else {
      for (const [key, val] of Object.entries(item.niveles)) {
        if (typeof val === 'string') result[key] = val;
        else if (val) result[key] = String(val);
      }
    }
  }

  // Caso 3: Propiedades directas en el apartado (e.g. nivel_1, nivel_2, d1, d2)
  if (Object.keys(result).length === 0) {
    const directLevelRegex = /^(?:nivel[_\s-]?([0-9a-zA-Z]+)|d([1-9]))$/i;
    for (const [prop, val] of Object.entries(item)) {
      const match = prop.match(directLevelRegex);
      if (match && typeof val === 'string' && val.trim()) {
        const nivelKey = match[1] ?? match[2];
        result[nivelKey] = val;
      }
    }
  }

  return result;
}

/**
 * Escalas estándar conocidas en educación secundaria / LOMLOE en Castilla y León
 */
const KNOWN_LEVEL_RANKS: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'insuficiente': 1,
  'in': 1,
  'suficiente': 2,
  'su': 2,
  'bien': 3,
  'bi': 3,
  'notable': 4,
  'nt': 4,
  'sobresaliente': 5,
  'sb': 5,
  'inicial': 1,
  'en proceso': 2,
  'en desarrollo': 2,
  'conseguido': 3,
  'avanzado': 4,
  'excelente': 5,
  'nivel 1': 1,
  'nivel 2': 2,
  'nivel 3': 3,
  'nivel 4': 4,
  'nivel 5': 5,
};

/**
 * Ordena los niveles de desempeño de forma coherente
 */
export function sortNiveles(niveles: string[], asc: boolean = true): string[] {
  const sorted = [...niveles].sort((a, b) => {
    const cleanA = a.trim().toLowerCase();
    const cleanB = b.trim().toLowerCase();

    // Comprobar si tienen ranking conocido
    const rankA = KNOWN_LEVEL_RANKS[cleanA];
    const rankB = KNOWN_LEVEL_RANKS[cleanB];

    if (rankA !== undefined && rankB !== undefined) {
      return rankA - rankB;
    }

    // Comprobar números puros o que comienzan por número
    const numA = parseFloat(a.replace(/[^0-9.]/g, ''));
    const numB = parseFloat(b.replace(/[^0-9.]/g, ''));

    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  return asc ? sorted : sorted.reverse();
}

/**
 * Normaliza y estructura una rúbrica para su visualización exhaustiva
 */
export function normalizeRubrica(rubrica: Rubrica): NormalizedRubrica {
  const rawItems = parseRubricaItems(rubrica.items);
  const uniqueNivelesSet = new Set<string>();
  const uniqueCriteriosSet = new Set<string>();

  let sumaPesosCalculada = 0;
  let hayPesosNumericos = false;

  const items: NormalizedRubricaItem[] = rawItems.map((item, index) => {
    const numero = item.numero !== undefined && item.numero !== null
      ? String(item.numero)
      : String(index + 1);

    const titulo = item.titulo ||
      item.nombre ||
      item.indicador ||
      item.aspecto ||
      item.descripcion ||
      `Apartado ${numero}`;

    // Peso / Ponderación
    let peso: number | null = null;
    if (typeof item.peso === 'number' && !isNaN(item.peso)) {
      peso = item.peso;
      sumaPesosCalculada += item.peso;
      hayPesosNumericos = true;
    } else if (typeof item.ponderacion === 'number' && !isNaN(item.ponderacion)) {
      peso = item.ponderacion;
      sumaPesosCalculada += item.ponderacion;
      hayPesosNumericos = true;
    } else if (typeof item.peso === 'string') {
      const parsed = parseFloat(item.peso.replace('%', '').trim());
      if (!isNaN(parsed)) {
        peso = parsed;
        sumaPesosCalculada += parsed;
        hayPesosNumericos = true;
      }
    }

    // Criterios vinculados
    const criteriosList: string[] = [];
    if (typeof item.criterio === 'string' && item.criterio.trim()) {
      criteriosList.push(item.criterio.trim());
      uniqueCriteriosSet.add(item.criterio.trim());
    }
    if (Array.isArray(item.criterios)) {
      item.criterios.forEach((c: any) => {
        if (typeof c === 'string' && c.trim()) {
          if (!criteriosList.includes(c.trim())) criteriosList.push(c.trim());
          uniqueCriteriosSet.add(c.trim());
        }
      });
    }

    // Descriptores
    const descriptores = extractItemDescriptores(item);
    Object.keys(descriptores).forEach((k) => uniqueNivelesSet.add(k));

    return {
      id: item.id || `item-${index}`,
      numero,
      titulo,
      peso,
      criterios: criteriosList,
      descriptores,
      raw: item,
    };
  });

  // Si no se detectó ningún nivel en los descriptores pero hay items,
  // revisar si la rúbrica tiene propiedad niveles o escala
  if (uniqueNivelesSet.size === 0 && (rubrica as any).niveles) {
    const rNiveles = (rubrica as any).niveles;
    if (Array.isArray(rNiveles)) {
      rNiveles.forEach((n) => uniqueNivelesSet.add(String(n)));
    }
  }

  // Si sigue vacío, establecer por defecto niveles 1 a 4 si hay items
  if (uniqueNivelesSet.size === 0 && items.length > 0) {
    ['1', '2', '3', '4'].forEach((n) => uniqueNivelesSet.add(n));
  }

  const nivelesOrdenados = sortNiveles(Array.from(uniqueNivelesSet), true);

  return {
    id: rubrica.id,
    grupo_id: rubrica.grupo_id,
    titulo: rubrica.titulo || 'Rúbrica sin título',
    tipo: rubrica.tipo || 'Rúbrica Analítica',
    descripcion: rubrica.descripcion || null,
    items,
    niveles: nivelesOrdenados,
    sumaPesos: hayPesosNumericos ? Math.round(sumaPesosCalculada * 100) / 100 : null,
    criteriosUnicos: Array.from(uniqueCriteriosSet),
    raw: rubrica,
  };
}

/**
 * Determina el color temático para un nivel dado para guiar visualmente
 * la lectura de la escala (de menor a mayor desempeño).
 */
export function getLevelBadgeStyle(nivel: string, totalNiveles: number = 4): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  const clean = nivel.toLowerCase().trim();

  // Caso específico por nombre
  if (clean.includes('insuf') || clean === '1') {
    return {
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
    };
  }
  if (clean.includes('sufic') || clean === '2' || clean.includes('proceso')) {
    return {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      dot: 'bg-amber-500',
    };
  }
  if (clean.includes('bien') || clean.includes('notable') || clean === '3' || clean.includes('conseguido')) {
    return {
      bg: 'bg-sky-50',
      text: 'text-sky-800',
      border: 'border-sky-200',
      dot: 'bg-sky-500',
    };
  }
  if (clean.includes('sobresal') || clean.includes('excel') || clean === '4' || clean.includes('avanzado')) {
    return {
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
    };
  }

  return {
    bg: 'bg-slate-50',
    text: 'text-slate-800',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  };
}
