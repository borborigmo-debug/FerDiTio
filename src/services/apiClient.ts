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
