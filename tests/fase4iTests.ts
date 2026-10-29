/**
 * Fernanditio - Pruebas de la Fase 4I
 * Verificación del comportamiento de fallbacks y no duplicación de llamadas a Gemini.
 */

import assert from 'assert';
import { analizarRubricaConGemini, AnalisisRubricaGeminiParams } from '../src/services/rubricasService';
import { _setTestIdTokenProvider } from '../src/services/authService';

console.log('=== INICIANDO PRUEBAS FASE 4I: EVITAR LLAMADAS DUPLICADAS A GEMINI ===\n');

_setTestIdTokenProvider(async () => 'mock-valid-firebase-token');

const mockParams: AnalisisRubricaGeminiParams = {
  grupoId: 'grupo_4i_test',
  origen: 'prompt',
  promptTexto: 'Crear rúbrica de comentario de texto',
};

const mockBorradorValido = {
  titulo: 'Rúbrica de Comentario',
  tipo: 'TRABAJO' as const,
  descripcion: 'Rúbrica válida',
  items: [],
  totalCriteriosDisponibles: 2,
};

function createMockResponse(body: any, status = 200, statusText = 'OK') {
  const isJson = typeof body === 'object' && body !== null;
  const bodyText = isJson ? JSON.stringify(body) : String(body ?? '');

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get: (header: string) => {
        if (header.toLowerCase() === 'content-type') {
          return isJson ? 'application/json' : 'text/plain';
        }
        return null;
      },
    },
    json: async () => {
      if (!isJson) throw new SyntaxError('Unexpected token in JSON');
      return body;
    },
    text: async () => bodyText,
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

async function runTests() {
  let expressCalls = 0;
  let fallbackCalls = 0;

  function resetCounts() {
    expressCalls = 0;
    fallbackCalls = 0;
  }

  // 1. Prueba 1: Fallo de red antes de recibir respuesta HTTP -> intenta el fallback 1 sola vez
  console.log('Prueba 1: Fallo de red real en Express permite fallback una sola vez');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      throw new TypeError('Failed to fetch (Network Error)');
    }
    if (urlStr.includes('/api/fernanditio-data') || urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  const res1 = await analizarRubricaConGemini(mockParams);
  assert.strictEqual(expressCalls, 1, 'Express debe haberse intentado 1 vez');
  assert.strictEqual(fallbackCalls, 1, 'El fallback debe haberse intentado 1 vez');
  assert.deepStrictEqual(res1, mockBorradorValido, 'Debe retornar el borrador obtenido del fallback');
  console.log('  -> OK: Fallback ejecutado exitosamente ante fallo de red real');

  // 2. Prueba 2: HTTP 502 NO activa el fallback
  console.log('\nPrueba 2: HTTP 502 de Express NO activa el fallback');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ error: 'Bad Gateway del proxy local' }, 502, 'Bad Gateway');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber lanzado excepción ante HTTP 502');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1, 'Express debe haber sido llamado 1 vez');
    assert.strictEqual(fallbackCalls, 0, 'Fallback NO debe llamarse ante HTTP 502');
    assert(err.message.includes('502'), 'Mensaje de error debe incluir el código 502');
    assert(err.message.includes('Bad Gateway'), 'Mensaje de error debe incluir el detalle retornado');
    console.log(`  -> OK: HTTP 502 rechazado correctamente sin fallback ("${err.message}")`);
  }

  // 3. Prueba 3: HTTP 504 NO activa el fallback
  console.log('\nPrueba 3: HTTP 504 de Express NO activa el fallback');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ error: 'Gateway Timeout al procesar rúbrica con Gemini' }, 504, 'Gateway Timeout');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber lanzado excepción ante HTTP 504');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1, 'Express debe haber sido llamado 1 vez');
    assert.strictEqual(fallbackCalls, 0, 'Fallback NO debe llamarse ante HTTP 504');
    assert(err.message.includes('504'), 'Mensaje de error debe incluir el código 504');
    assert(err.message.includes('Gateway Timeout'), 'Mensaje debe incluir detalle');
    console.log(`  -> OK: HTTP 504 rechazado correctamente sin fallback ("${err.message}")`);
  }

  // 4. Prueba 4: HTTP 429 NO activa el fallback y conserva el error
  console.log('\nPrueba 4: HTTP 429 NO activa el fallback y conserva el error');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ error: 'Cuota de peticiones a Gemini agotada. Reintente más tarde.' }, 429, 'Too Many Requests');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber lanzado excepción ante HTTP 429');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1);
    assert.strictEqual(fallbackCalls, 0);
    assert(err.message.includes('429'));
    assert(err.message.includes('Cuota de peticiones'));
    console.log(`  -> OK: HTTP 429 rechazado correctamente ("${err.message}")`);
  }

  // 5. Prueba 5: HTTP 503 NO activa el fallback y conserva el error
  console.log('\nPrueba 5: HTTP 503 NO activa el fallback y conserva el error');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ error: 'Servicio de modelos Gemini temporalmente no disponible.' }, 503, 'Service Unavailable');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber lanzado excepción ante HTTP 503');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1);
    assert.strictEqual(fallbackCalls, 0);
    assert(err.message.includes('503'));
    assert(err.message.includes('temporalmente no disponible'));
    console.log(`  -> OK: HTTP 503 rechazado correctamente ("${err.message}")`);
  }

  // 6. Prueba 6: HTTP 401 y 403 NO activan el fallback
  console.log('\nPrueba 6: HTTP 401 y 403 NO activan el fallback');
  // 6a: 401
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ error: 'Token de autenticación expirado' }, 401, 'Unauthorized');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber fallado con 401');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1);
    assert.strictEqual(fallbackCalls, 0);
    assert(err.message.includes('401'));
    console.log(`  -> OK: HTTP 401 no activa fallback ("${err.message}")`);
  }

  // 6b: 403
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ error: 'El grupo especificado no pertenece al docente autenticado' }, 403, 'Forbidden');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber fallado con 403');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1);
    assert.strictEqual(fallbackCalls, 0);
    assert(err.message.includes('403'));
    console.log(`  -> OK: HTTP 403 no activa fallback ("${err.message}")`);
  }

  // 7. Prueba 7: HTTP 200 con borrador inválido NO activa el fallback
  console.log('\nPrueba 7: HTTP 200 con borrador inválido NO activa el fallback');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ success: false, error: 'No se pudo estructurar la rúbrica' }, 200, 'OK');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber fallado por borrador inválido');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1);
    assert.strictEqual(fallbackCalls, 0);
    assert(err.message.includes('No se pudo estructurar la rúbrica'));
    console.log(`  -> OK: HTTP 200 borrador inválido no activa fallback ("${err.message}")`);
  }

  // 8. Prueba 8: HTTP 200 con borrador válido lo retorna sin activar el fallback
  console.log('\nPrueba 8: HTTP 200 con borrador válido retorna el borrador directamente');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200, 'OK');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  const res8 = await analizarRubricaConGemini(mockParams);
  assert.strictEqual(expressCalls, 1);
  assert.strictEqual(fallbackCalls, 0);
  assert.deepStrictEqual(res8, mockBorradorValido);
  console.log('  -> OK: Borrador retornado sin invocar el fallback');

  // 9. Prueba 9: Si falla la petición al fallback, se muestra un error comprensible
  console.log('\nPrueba 9: Si la petición al fallback falla, se muestra un error comprensible');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      throw new TypeError('Failed to fetch');
    }
    if (urlStr.includes('/api/fernanditio-data') || urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ error: 'La Edge Function rechaza el formato de imagen' }, 400, 'Bad Request');
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber fallado tras fallo en fallback');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1);
    assert.strictEqual(fallbackCalls, 1);
    assert(err.message.includes('La Edge Function rechaza el formato de imagen') || err.message.includes('400'));
    console.log(`  -> OK: Error comprensible del fallback expuesto correctamente ("${err.message}")`);
  }

  // 10. Prueba 10: HTTP 200 con respuesta no-JSON (ej. HTML SPA fallback) produce error controlado sin activar el fallback
  console.log('\nPrueba 10: HTTP 200 con HTML (no-JSON) produce error controlado y NO activa el fallback');
  resetCounts();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/gemini/analizar-rubrica')) {
      expressCalls++;
      return createMockResponse('<!DOCTYPE html><html><body>SPA</body></html>', 200, 'OK');
    }
    if (urlStr.includes('fernanditio-data')) {
      fallbackCalls++;
      return createMockResponse({ success: true, borrador: mockBorradorValido }, 200);
    }
    throw new Error(`URL insospechada: ${urlStr}`);
  }) as typeof fetch;

  try {
    await analizarRubricaConGemini(mockParams);
    assert.fail('Debería haber fallado por respuesta no-JSON');
  } catch (err: any) {
    assert.strictEqual(expressCalls, 1);
    assert.strictEqual(fallbackCalls, 0);
    assert(err.message.includes('respuesta inesperada no-JSON') || err.message.includes('200'));
    console.log(`  -> OK: HTTP 200 no-JSON rechazado con mensaje controlado ("${err.message}")`);
  }

  // Restaurar fetch original
  globalThis.fetch = originalFetch;

  console.log('\n=== TODAS LAS PRUEBAS (INCLUIDAS FASE 4N) HAN PASADO EXITOSAMENTE ===');
}

runTests().catch((e) => {
  console.error('\n❌ ERROR EN LAS PRUEBAS FASE 4I:', e);
  process.exit(1);
});
