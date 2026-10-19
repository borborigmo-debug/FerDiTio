/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rubrica, ActividadDetalle, RubricaItem } from '../types';
import { parseRubricaItems, isValidUuid, asegurarApartadosConUuid, generateUuid } from '../utils/rubricaUtils';
import { getCurrentIdToken } from './authService';

const SUPABASE_FUNCTIONS_BASE = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1';

/**
 * Asegura que todos los apartados de una rúbrica dispongan de un identificador UUID persistente,
 * inmutable y verificado (RFC 4122/9562), persistiendo la actualización en la tabla public.rubricas
 * de Supabase a través de la Edge Function fernanditio-data antes de que se puedan emitir o registrar
 * calificaciones asociadas a dichos apartados.
 */
export async function asegurarYPersistirRubricaUuids(
  grupoId: string,
  rubrica: Rubrica
): Promise<Rubrica> {
  if (!grupoId || !rubrica) return rubrica;

  const rawItems = parseRubricaItems(rubrica.items);
  const faltanUuids = rawItems.some((it: any) => !isValidUuid(it?.id));

  // Si ya todos tienen UUID válido y único, devolver sin realizar llamadas remotas innecesarias
  if (!faltanUuids) {
    const seen = new Set<string>();
    let hayDuplicados = false;
    for (const it of rawItems) {
      const idL = String(it.id).toLowerCase();
      if (seen.has(idL)) {
        hayDuplicados = true;
        break;
      }
      seen.add(idL);
    }
    if (!hayDuplicados) {
      return rubrica;
    }
  }

  // Generar UUIDs deterministas y seguros para los apartados que los necesiten
  const itemsConUuid = asegurarApartadosConUuid(rawItems);
  const rubricaConUuids: Rubrica = {
    ...rubrica,
    items: itemsConUuid,
  };

  // Intentar persistir en Supabase mediante la Edge Function fernanditio-data
  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión autenticada activa para persistir los identificadores de la rúbrica en Supabase.');
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
        tipo: 'actualizar_rubrica',
        grupoId,
        rubricaId: rubrica.id,
        items: itemsConUuid,
      }),
    });
  } catch (err: any) {
    throw new Error(`Error de red al conectar con el servidor para persistir los identificadores de la rúbrica: ${err?.message || 'Fallo de conexión'}`);
  }

  if (!response.ok) {
    let detalleError = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson?.error) {
        detalleError = errorJson.error;
      }
    } catch {
      // Ignorar error de parseo JSON si el servidor no devolvió cuerpo JSON
    }
    throw new Error(`El servidor rechazó la actualización de la rúbrica (${detalleError}).`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch (err: any) {
    throw new Error('Respuesta malformada del servidor al persistir los identificadores de la rúbrica.');
  }

  if (!data?.success || !data?.rubrica) {
    throw new Error(data?.error || 'Supabase no confirmó la persistencia de los nuevos apartados en la tabla public.rubricas.');
  }

  return {
    ...rubricaConUuids,
    ...data.rubrica,
    items: parseRubricaItems(data.rubrica.items),
  };
}

export interface CrearRubricaPayload {
  grupoId: string;
  titulo: string;
  tipoRubrica: 'ACTIVIDAD' | 'TRABAJO' | 'EXAMEN';
  evaluacionPeriodo: '1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global';
  descripcion?: string | null;
  items?: Array<{
    id?: string;
    numero?: string;
    titulo: string;
    peso?: number | null;
    criterios?: string[];
    criterio?: string;
    descriptores?: Record<string, string>;
  }>;
}

export interface CrearRubricaResultado {
  success: boolean;
  rubrica: Rubrica;
  actividad: ActividadDetalle;
}

/**
 * Crea una nueva rúbrica y su actividad vinculada en Supabase a través de la
 * Edge Function 'fernanditio-data', garantizando UUIDs v4 RFC 4122 únicos
 * y persistidos en public.rubricas.items desde el primer guardado.
 */
export async function crearRubricaYActividad(
  payload: CrearRubricaPayload
): Promise<CrearRubricaResultado> {
  const { grupoId, titulo, tipoRubrica, evaluacionPeriodo, descripcion, items = [] } = payload;

  if (!grupoId || !grupoId.trim()) {
    throw new Error('Identificador de grupo inválido para crear la rúbrica.');
  }

  if (!titulo || !titulo.trim()) {
    throw new Error('El título de la rúbrica y de la actividad no puede estar vacío.');
  }

  // Asegurar que cada apartado tenga UUID v4 persistente generado antes del envío
  const itemsConUuid = items.map((it, idx) => {
    const cleanId = typeof it.id === 'string' && isValidUuid(it.id)
      ? it.id.trim().toLowerCase()
      : generateUuid().toLowerCase();

    return {
      id: cleanId,
      numero: it.numero ? String(it.numero).trim() : String(idx + 1),
      titulo: it.titulo && it.titulo.trim() ? it.titulo.trim() : `Apartado ${idx + 1}`,
      peso: typeof it.peso === 'number' && !isNaN(it.peso) ? it.peso : null,
      criterios: Array.isArray(it.criterios) ? it.criterios : (it.criterio ? [it.criterio] : []),
      descriptores: it.descriptores && typeof it.descriptores === 'object' ? it.descriptores : {
        "1": "Inicial / Insuficiente",
        "2": "En proceso / Suficiente",
        "3": "Conseguido / Notable",
        "4": "Avanzado / Sobresaliente",
      },
    };
  });

  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión autenticada activa para crear la rúbrica en Supabase.');
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
        tipo: 'crear_rubrica',
        grupoId,
        titulo: titulo.trim(),
        tipoRubrica,
        evaluacionPeriodo,
        descripcion: descripcion?.trim() || null,
        items: itemsConUuid,
      }),
    });
  } catch (err: any) {
    throw new Error(`Error de red al conectar con el servidor: ${err?.message || 'Fallo de conexión'}`);
  }

  if (!response.ok) {
    let detalleError = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson?.error) {
        detalleError = errorJson.error;
      }
    } catch {
      // Ignorar fallo de parseo JSON
    }
    throw new Error(`El servidor rechazó la creación de la rúbrica (${detalleError}).`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch (err: any) {
    throw new Error('Respuesta malformada del servidor al crear la rúbrica.');
  }

  if (!data?.success || !data?.rubrica || !data?.actividad) {
    throw new Error(data?.error || 'Supabase no confirmó la persistencia de la nueva rúbrica y su actividad vinculada.');
  }

  const rubricaRetornada: Rubrica = {
    ...data.rubrica,
    items: parseRubricaItems(data.rubrica.items),
  };

  const actividadRetornada: ActividadDetalle = data.actividad;

    return {
    success: true,
    rubrica: rubricaRetornada,
    actividad: actividadRetornada,
  };
}

export interface AnalisisRubricaGeminiParams {
  grupoId: string;
  origen: 'foto' | 'word';
  imagenBase64?: string;
  mimeType?: string;
  documentoTexto?: string;
}

export interface ApartadoBorradorGemini {
  id: string;
  numero: string;
  titulo: string;
  peso: number | null;
  criterios: string[];
  criteriosPendientes: boolean;
  descriptores: {
    "1": string;
    "2": string;
    "3": string;
    "4": string;
  };
}

export interface BorradorRubricaGemini {
  titulo: string;
  tipo: 'ACTIVIDAD' | 'TRABAJO' | 'EXAMEN';
  descripcion: string | null;
  items: ApartadoBorradorGemini[];
  totalCriteriosDisponibles: number;
}

/**
 * Invoca el análisis asistido de rúbricas mediante Gemini a partir de foto o Word.
 * La llamada al backend se realiza de forma autenticada con token Firebase, verificando
 * en el servidor los criterios oficiales del grupo y depurando alucinaciones de la IA.
 */
export async function analizarRubricaConGemini(
  params: AnalisisRubricaGeminiParams
): Promise<BorradorRubricaGemini> {
  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión autenticada activa para comunicarse con el servidor.');
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
        tipo: 'analizar_rubrica_gemini',
        grupoId: params.grupoId,
        origen: params.origen,
        imagenBase64: params.imagenBase64,
        mimeType: params.mimeType,
        documentoTexto: params.documentoTexto,
      }),
    });
  } catch (err: any) {
    throw new Error(`Error de red al conectar con el servicio de análisis: ${err?.message || 'Fallo de conexión'}`);
  }

  if (!response.ok) {
    let detalleError = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson?.error) {
        detalleError = errorJson.error;
      }
    } catch {
      // Ignorar
    }
    throw new Error(detalleError);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error('Respuesta malformada del servidor al recibir el análisis de Gemini.');
  }

  if (!data?.success || !data?.borrador) {
    throw new Error(data?.error || 'No se pudo obtener el borrador estructurado de la rúbrica.');
  }

  return data.borrador;
}

/**
 * Elimina en lote rúbricas de un grupo autorizado en Supabase,
 * desvinculando automáticamente las actividades asociadas.
 */
export async function eliminarRubricasLote(
  grupoId: string,
  rubricaIds: string[]
): Promise<{ success: boolean; eliminadas: string[] }> {
  if (!grupoId || !Array.isArray(rubricaIds) || rubricaIds.length === 0) {
    throw new Error('Parámetros inválidos para eliminar rúbricas.');
  }

  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión autenticada activa para eliminar rúbricas.');
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
        tipo: 'eliminar_rubricas',
        grupoId,
        rubricaIds,
      }),
    });
  } catch (err: any) {
    throw new Error(`Error de red al conectar con el servidor: ${err?.message || err}`);
  }

  if (!response.ok) {
    let detalle = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error) detalle = errJson.error;
    } catch {}
    throw new Error(detalle);
  }

  return await response.json();
}

