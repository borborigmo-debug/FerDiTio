/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rubrica, RubricaItem, Criterio } from '../types';

/**
 * Comparador canónico para códigos de criterios (ej: "1.1", "1.2", ..., "9.2", "10.1", "10.2").
 * Regla normativa: El 10.1 y el 10.2 deben aparecer en último lugar.
 */
export function compararCodigosCriterio(a: string, b: string): number {
  const normA = (a || '').trim();
  const normB = (b || '').trim();

  if (normA === normB) return 0;

  // Si uno de los dos es 10.1 o 10.2 (o empieza por 10.) y el otro no, 10.x va al final
  const isDiezA = /^10(?:\.[0-9a-zA-Z]+)?$/i.test(normA) || normA === '10.1' || normA === '10.2';
  const isDiezB = /^10(?:\.[0-9a-zA-Z]+)?$/i.test(normB) || normB === '10.1' || normB === '10.2';

  if (isDiezA && !isDiezB) return 1; // A va al final
  if (!isDiezA && isDiezB) return -1; // B va al final

  // Si ambos son 10.x o ninguno es 10.x, descomponer numéricamente
  const matchA = normA.match(/^(\d+)(?:\.(\d+))?(.*)$/);
  const matchB = normB.match(/^(\d+)(?:\.(\d+))?(.*)$/);

  if (matchA && matchB) {
    const majorA = parseInt(matchA[1], 10);
    const majorB = parseInt(matchB[1], 10);
    if (majorA !== majorB) return majorA - majorB;

    const minorA = matchA[2] !== undefined ? parseInt(matchA[2], 10) : 0;
    const minorB = matchB[2] !== undefined ? parseInt(matchB[2], 10) : 0;
    if (minorA !== minorB) return minorA - minorB;

    return (matchA[3] || '').localeCompare(matchB[3] || '');
  }

  // Fallback con orden natural alfanumérico
  return normA.localeCompare(normB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Comparador para objetos Criterio basado en su código oficial,
 * garantizando que el 10.1 y el 10.2 aparezcan en último lugar.
 */
export function compararCriterios(a: Criterio, b: Criterio): number {
  return compararCodigosCriterio(a?.codigo || '', b?.codigo || '');
}

export interface NormalizedRubricaItem {
  id: string; // Clave para renderizado determinista y estado local en UI (React key o visualId)
  uuid?: string; // Identificador UUID persistente verificado (solo presente si existe en los datos persistidos)
  legacyId?: string; // Identificador histórico o sintético previo si fue normalizado
  hasPersistentUuid: boolean; // Indica explícitamente si el apartado posee un UUID persistente verificado
  numero: string;
  titulo: string;
  peso: number | null;
  criterios: string[];
  descriptores: Record<string, string>;
  raw: any; // Objeto original sin mutación
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
  created_at?: string;
  updated_at?: string;
  fecha?: string | null;
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
 * Expresión regular canónica de UUID estándar (RFC 4122 y RFC 9562).
 * Estructura estándar 8-4-4-4-12 en notación hexadecimal (36 caracteres con guiones).
 * No es sensible a mayúsculas/minúsculas.
 */
export const CANONICAL_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Expresión regular para validar formato estándar UUID con versión y variante formal (RFC 4122 v1-v5 y RFC 9562 v6-v8).
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Comprueba si un valor es una cadena UUID canónica válida (RFC 4122 / RFC 9562).
 * Ignora espacios en blanco al inicio o al final.
 */
export function isValidUuid(value: any): boolean {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  return CANONICAL_UUID_REGEX.test(clean);
}

/**
 * Genera un UUID v4 criptográficamente seguro utilizando crypto.randomUUID
 * o crypto.getRandomValues (RFC 4122 v4). No utiliza Math.random bajo ninguna circunstancia.
 * Falla de forma explícita si el entorno carece de un CSPRNG disponible.
 */
export function generateUuid(): string {
  const c = typeof globalThis !== 'undefined' && globalThis.crypto
    ? globalThis.crypto
    : (typeof crypto !== 'undefined' ? crypto : undefined);

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Versión 4 (RFC 4122)
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variante RFC 4122
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error('CSPRNG no disponible: el entorno carece de soporte criptográfico seguro para generar UUIDs');
}

/**
 * Asegura que una lista de apartados disponga de UUID persistente e inmutable.
 * Utilidad pura, sin efectos secundarios, destinada exclusivamente a flujos explícitos
 * futuros de creación, duplicación, importación o guardado de rúbricas.
 *
 * Reglas garantizadas:
 * 1. Conserva estrictamente los UUID válidos existentes (sin regenerarlos).
 * 2. Asigna un UUID nuevo (v4 seguro) a cada apartado cuyo ID esté ausente, vacío o no sea un UUID válido.
 * 3. Preserva el 100% de las propiedades originales de cada apartado (incluyendo campos desconocidos o históricos).
 * 4. Preserva el orden original del array.
 * 5. No muta el array recibido ni los objetos originales que contiene (inmutabilidad estricta).
 * 6. Falla de forma explícita si no existe un generador criptográfico seguro en el entorno.
 * 7. Es idempotente: una segunda ejecución sobre una lista normalizada produce el mismo resultado idéntico.
 */
export function asegurarApartadosConUuid<T extends Record<string, any>>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];
  const seenUuids = new Set<string>();

  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    
    // Si ya dispone de un UUID válido y NO se ha repetido previamente en esta rúbrica
    if (isValidUuid(item.id)) {
      const cleanId = String(item.id).trim().toLowerCase();
      if (!seenUuids.has(cleanId)) {
        seenUuids.add(cleanId);
        return {
          ...item,
          id: cleanId,
        };
      }
      // Si el UUID ya apareció en un apartado anterior dentro de la misma rúbrica,
      // se corrige la colisión generando un UUID único nuevo
    }

    // Si carece de UUID válido (ausente, nulo, vacío, sintético 'item-0') o es duplicado:
    const rawId = item.id !== undefined && item.id !== null ? String(item.id).trim() : undefined;
    const hasExistingLegacyId = typeof item.legacyId === 'string' && item.legacyId.trim().length > 0;
    const preserveLegacy = !hasExistingLegacyId && rawId && !isValidUuid(rawId) ? rawId : undefined;

    let newUuid = generateUuid().toLowerCase();
    while (seenUuids.has(newUuid)) {
      newUuid = generateUuid().toLowerCase();
    }
    seenUuids.add(newUuid);

    return {
      ...item,
      id: newUuid,
      ...(preserveLegacy ? { legacyId: preserveLegacy } : {}),
    };
  });
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

    // Identificador persistente verificado vs. Clave visual para la UI:
    // 1. Si el ítem ya cuenta con un UUID válido en los datos persistidos, se expone en 'uuid'.
    // 2. Si carece de UUID persistente, 'uuid' permanece undefined (nunca se presenta un ID sintético como persistente).
    // 3. Para 'id' (utilizado por React como key de renderizado y acordeones), se usa el id existente o 'item-${index}'.
    // 4. El objeto original referenciado en 'raw' se conserva estrictamente intacto, sin mutaciones.
    const persistentUuid = isValidUuid(item.id) ? item.id.trim() : undefined;
    const visualId = (typeof item.id === 'string' && item.id.trim().length > 0)
      ? item.id.trim()
      : `item-${index}`;
    const legacyId = (typeof item.legacyId === 'string' && item.legacyId.trim().length > 0)
      ? item.legacyId.trim()
      : (visualId && !isValidUuid(visualId) ? visualId : undefined);

    return {
      id: visualId,
      uuid: persistentUuid,
      legacyId,
      hasPersistentUuid: Boolean(persistentUuid),
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
    criteriosUnicos: Array.from(uniqueCriteriosSet).sort(compararCodigosCriterio),
    created_at: rubrica.created_at,
    updated_at: rubrica.updated_at,
    fecha: rubrica.fecha,
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
