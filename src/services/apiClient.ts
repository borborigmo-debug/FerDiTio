/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCurrentIdToken } from './authService';

/**
 * Cliente HTTP preparado para las siguientes fases (comunicación con el backend Express).
 *
 * En esta fase no realiza llamadas automáticas ni simula datos, pero deja
 * preparada la inyección del Bearer Token de Firebase verificado criptográficamente.
 */
export interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { requiresAuth = true, headers = {}, ...rest } = options;
  const resolvedHeaders = new Headers(headers);

  if (requiresAuth) {
    const token = await getCurrentIdToken();
    if (!token) {
      throw new Error('No hay sesión de autenticación activa para autorizar esta petición.');
    }
    resolvedHeaders.set('Authorization', `Bearer ${token}`);
  }

  // Prevenir Content-Type si ya se envía FormData (para fotos de rúbricas en fases posteriores)
  if (!resolvedHeaders.has('Content-Type') && !(rest.body instanceof FormData)) {
    resolvedHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...rest,
    headers: resolvedHeaders,
  });

  if (!response.ok) {
    let errorMessage = `Error HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData?.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Ignorar fallo de parseo JSON en caso de error crudo
    }
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
}

const SUPABASE_FUNCTIONS_BASE = 'https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1';

/**
 * Realiza peticiones a la Edge Function 'fernanditio-data' ofreciendo resiliencia
 * y redundancia: intenta primero la ruta proxy local /api/fernanditio-data (que elimina
 * el 100% de restricciones CORS del navegador) y cae en fallback a la conexión directa con Supabase.
 */
export async function fetchFernanditioData(
  subpath: string = '',
  init: RequestInit = {}
): Promise<Response> {
  const proxyUrl = `/api/fernanditio-data${subpath}`;
  const directUrl = `${SUPABASE_FUNCTIONS_BASE}/fernanditio-data${subpath}`;

  try {
   
const proxyRes = await fetch(proxyUrl, init);
const contentType = proxyRes.headers.get('content-type') || '';

// Solo aceptar respuestas JSON del proxy.
// Si Google AI Studio devuelve una página HTML de espera, probar Supabase directamente.
if (
  proxyRes.status !== 502 &&
  contentType.toLowerCase().includes('application/json')
) {
  return proxyRes;
}

console.warn(
  '[apiClient] El proxy no devolvió JSON válido; se intentará conexión directa con Supabase.',
  { status: proxyRes.status, contentType }
);

  } catch (err) {
    console.warn('[apiClient] Proxy local /api/fernanditio-data inaccesible, conectando directamente con Supabase:', err);
  }

  // Fallback a conexión directa con la Edge Function
  return fetch(directUrl, init);
}
