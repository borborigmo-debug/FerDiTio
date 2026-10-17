/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Rubrica } from '../types';
import { parseRubricaItems, isValidUuid, asegurarApartadosConUuid } from '../utils/rubricaUtils';
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
