/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rubrica, ActividadDetalle, RubricaItem } from '../types';
import { parseRubricaItems, isValidUuid, asegurarApartadosConUuid, generateUuid } from '../utils/rubricaUtils';
import { getCurrentIdToken } from './authService';
import { registrarActividadesEliminadasLocal } from './gruposService';
import { purgarRubricasDeRespaldoLocal } from './calificacionesService';

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

/**
 * Actualiza el título de una rúbrica en Supabase a través de la Edge Function fernanditio-data.
 */
export async function actualizarRubricaTitulo(
  grupoId: string,
  rubricaId: string,
  nuevoTitulo: string,
  itemsActuales?: any[]
): Promise<Rubrica> {
  if (!grupoId || !rubricaId) {
    throw new Error('Identificadores de grupo y rúbrica requeridos.');
  }
  const cleanTitulo = (nuevoTitulo || '').trim();
  if (!cleanTitulo) {
    throw new Error('El título de la rúbrica no puede estar vacío.');
  }

  const token = await getCurrentIdToken();
  if (!token) {
    throw new Error('No existe una sesión autenticada activa para actualizar el título de la rúbrica.');
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
        rubricaId,
        titulo: cleanTitulo,
        ...(Array.isArray(itemsActuales) ? { items: itemsActuales } : {}),
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
    } catch {}
    throw new Error(`El servidor rechazó la actualización del título (${detalleError}).`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error('Respuesta malformada del servidor al actualizar el título de la rúbrica.');
  }

  if (!data?.success || !data?.rubrica) {
    throw new Error(data?.error || 'Supabase no confirmó la actualización del título de la rúbrica.');
  }

  return {
    ...data.rubrica,
    items: parseRubricaItems(data.rubrica.items),
  };
}

export interface CrearRubricaPayload {
  grupoId: string;
  titulo: string;
  tipoRubrica: 'ACTIVIDAD' | 'TRABAJO' | 'EXAMEN';
  evaluacionPeriodo: '1.º Ev' | '2.º Ev' | '3.º Ev' | 'Global';
  seccionId?: string | null;
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
  const { grupoId, titulo, tipoRubrica, evaluacionPeriodo, seccionId, descripcion, items = [] } = payload;

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
        seccionId: seccionId || null,
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
    created_at: data.rubrica.created_at || new Date().toISOString(),
    items: parseRubricaItems(data.rubrica.items),
  };

  const actividadRetornada: ActividadDetalle = {
    ...data.actividad,
    seccion_id: seccionId || data.actividad.seccion_id || null,
    created_at: data.actividad.created_at || new Date().toISOString(),
  };

    return {
    success: true,
    rubrica: rubricaRetornada,
    actividad: actividadRetornada,
  };
}

export interface AnalisisRubricaGeminiParams {
  grupoId: string;
  origen: 'foto' | 'word' | 'galeria' | 'pdf' | 'ia' | 'prompt';
  imagenBase64?: string;
  mimeType?: string;
  documentoTexto?: string;
  promptTexto?: string;
  pdfBase64?: string;
  criterios?: Array<{ id?: any; codigo: string; descripcion?: string }>;
  grupoNombre?: string;
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
 * Invoca el análisis asistido de rúbricas mediante Gemini a partir de foto, galería (imagen/pdf/word) o prompt de IA.
 * Utiliza preferentemente la ruta server-side de la aplicación (/api/gemini/analizar-rubrica)
 * con la SDK oficial @google/genai, y ofrece fallback resiliente.
 */
export async function analizarRubricaConGemini(
  params: AnalisisRubricaGeminiParams
): Promise<BorradorRubricaGemini> {
  // 1. Probar la ruta server-side de Express en la app
  try {
    const resLocal = await fetch('/api/gemini/analizar-rubrica', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        origen: params.origen,
        imagenBase64: params.imagenBase64,
        mimeType: params.mimeType,
        documentoTexto: params.documentoTexto,
        promptTexto: params.promptTexto,
        pdfBase64: params.pdfBase64,
        criterios: params.criterios || [],
        grupoNombre: params.grupoNombre,
      }),
    });

    if (resLocal.ok) {
      const dataLocal = await resLocal.json();
      if (dataLocal?.success && dataLocal?.borrador) {
        return dataLocal.borrador;
      }
    } else {
      let msg = '';
      try {
        const errJson = await resLocal.json();
        msg = errJson?.error || '';
      } catch {
        // Ignorar
      }
      if (msg) {
        console.warn('[analizarRubricaConGemini] Servidor devolvió error:', msg);
      }
    }
  } catch (localErr) {
    console.warn('[analizarRubricaConGemini] Endpoint local inaccesible, intentando Edge Function:', localErr);
  }

  // 2. Fallback a Supabase Edge Function
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

const STORAGE_KEY_RUBRICAS_ELIMINADAS = 'fernanditio_rubricas_eliminadas_';

export function getRubricasEliminadasLocal(grupoId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_RUBRICAS_ELIMINADAS}${grupoId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map(String));
      }
    }
  } catch (err) {
    console.warn('[rubricasService] Error al leer rúbricas eliminadas localmente:', err);
  }
  return new Set();
}

export function registrarRubricasEliminadasLocal(grupoId: string, rubricaIds: string[]): void {
  try {
    const current = getRubricasEliminadasLocal(grupoId);
    rubricaIds.forEach((id) => current.add(String(id)));
    localStorage.setItem(
      `${STORAGE_KEY_RUBRICAS_ELIMINADAS}${grupoId}`,
      JSON.stringify(Array.from(current))
    );
  } catch (err) {
    console.warn('[rubricasService] Error al registrar rúbricas eliminadas localmente:', err);
  }
}

/**
 * Elimina en lote rúbricas de un grupo autorizado en Supabase,
 * eliminando también en cascada las actividades asociadas y sus calificaciones
 * dependientes tanto en el servidor como en Fernanditio.
 * Lanza error si la Edge Function no soporta la operación o falla; no simula éxito local.
 */
export async function eliminarRubricasLote(
  grupoId: string,
  rubricaIds: string[]
): Promise<{ success: boolean; eliminadas: string[]; actividadesEliminadas: string[] }> {
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
  } catch (netErr: any) {
    throw new Error(`Error de red al conectar con Supabase: ${netErr?.message || netErr}`);
  }

  if (response.ok) {
    const data = await response.json();
    if (data?.success) {
      const eliminadas = data.eliminadas || rubricaIds;
      const actividadesEliminadas = data.actividadesEliminadas || [];
      registrarRubricasEliminadasLocal(grupoId, eliminadas);
      if (actividadesEliminadas.length > 0) {
        registrarActividadesEliminadasLocal(grupoId, actividadesEliminadas);
      }
      purgarRubricasDeRespaldoLocal(grupoId, eliminadas, actividadesEliminadas);
      return {
        success: true,
        eliminadas,
        actividadesEliminadas,
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
        `La Edge Function remota de Supabase aún no tiene desplegada la operación 'eliminar_rubricas' (${detalle}). El cambio no se ha persistido en el servidor.`
      );
    }

    throw new Error(`Error al eliminar rúbricas en el servidor: ${detalle}`);
  }
}


