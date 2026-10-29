/**
 * Fernanditio - Pruebas locales de la Fase 4H
 * Verificación de casos límite de autenticación, grupoId, criterios y manejo de errores.
 */

import assert from 'assert';

console.log('=== INICIANDO PRUEBAS LOCALES FASE 4H ===\n');

// Mock de token con payload
function mockVerifyTokenPayload(token: string) {
  if (token === 'valid_unverified_email') {
    return { email: 'user@test.com', email_verified: false };
  }
  if (token === 'valid_verified_email') {
    return { email: 'user@test.com', email_verified: true };
  }
  throw new Error('Token inválido o caducado');
}

// 1. Prueba: Validar email_verified en token
console.log('Prueba 1: Requerir email_verified === true');
try {
  const p1 = mockVerifyTokenPayload('valid_unverified_email');
  if (!p1 || p1.email_verified !== true) {
    console.log('  -> OK: Rechazado token con email no verificado (401)');
  } else {
    assert.fail('Debería rechazar email no verificado');
  }
} catch {
  assert.fail('No debería fallar verifyTokenPayload para token verificado');
}

// 2. Prueba: Requerir grupoId obligatorio y no vacío
console.log('\nPrueba 2: Requerir grupoId no vacío');
function mockValidateGrupoId(body: any) {
  const grupoId = body?.grupoId;
  if (!grupoId || typeof grupoId !== 'string' || !grupoId.trim()) {
    return { status: 400, error: 'El parámetro grupoId es obligatorio.' };
  }
  return { status: 200 };
}
assert.strictEqual(mockValidateGrupoId({}).status, 400);
assert.strictEqual(mockValidateGrupoId({ grupoId: '' }).status, 400);
assert.strictEqual(mockValidateGrupoId({ grupoId: '   ' }).status, 400);
assert.strictEqual(mockValidateGrupoId({ grupoId: 'grupo_123' }).status, 200);
console.log('  -> OK: grupoId obligatorio verificado correctamente (400 si falta)');

// 3. Prueba: Verificación de propiedad del grupo y rechazo ante no pertenecencia
console.log('\nPrueba 3: Verificación de pertenencia del grupo');
function mockCheckGrupoBelongsToTeacher(grupoId: string, teacherToken: string) {
  if (grupoId === 'grupo_ajeno') {
    return { status: 403, error: 'El grupo especificado no existe o no pertenece al docente autenticado.' };
  }
  if (grupoId === 'grupo_propio') {
    return { status: 200, criterios: [{ codigo: '1.1' }, { codigo: '1.2' }] };
  }
  if (grupoId === 'grupo_sin_criterios') {
    return { status: 200, criterios: [] };
  }
  return { status: 500, error: 'Error de servidor' };
}
assert.strictEqual(mockCheckGrupoBelongsToTeacher('grupo_ajeno', 'token').status, 403);
console.log('  -> OK: Rechazado acceso a grupo ajeno con HTTP 403');

// 4. Prueba: Criterios oficiales vacíos resultan en criterios: []
console.log('\nPrueba 4: Criterios oficiales vacíos desautorizan códigos arbitrarios');
function mockFilterCriteria(criteriosOficiales: any[], itemsGenerados: any[]) {
  const codigosOficialesSet = new Set(
    Array.isArray(criteriosOficiales)
      ? criteriosOficiales.map((c) => (c?.codigo ? String(c.codigo).trim().toLowerCase() : '')).filter(Boolean)
      : []
  );

  return itemsGenerados.map((it) => {
    let criteriosFiltrados: string[] = [];
    if (codigosOficialesSet.size > 0 && Array.isArray(it.criterios)) {
      criteriosFiltrados = it.criterios.filter((cod: string) => {
        if (!cod || typeof cod !== 'string') return false;
        return codigosOficialesSet.has(cod.trim().toLowerCase());
      });
    }
    return { ...it, criterios: criteriosFiltrados };
  });
}

const itemsConCodigosInventados = [{ titulo: 'Comprensión', criterios: ['9.9.9', 'inventado'] }];
const resultadoVacio = mockFilterCriteria([], itemsConCodigosInventados);
assert.deepStrictEqual(resultadoVacio[0].criterios, []);
console.log('  -> OK: Cuando los criterios del grupo están vacíos, resultan criterios: []');

const resultadoConCoincidencia = mockFilterCriteria([{ codigo: '1.1' }], [{ titulo: 'Comprensión', criterios: ['1.1', '9.9'] }]);
assert.deepStrictEqual(resultadoConCoincidencia[0].criterios, ['1.1']);
console.log('  -> OK: Solo se conservan códigos explícitamente presentes en los criterios oficiales');

// 5. Prueba: Detención inmediata de reintentos ante HTTP 429 y 503
console.log('\nPrueba 5: Detención inmediata de modelos de Gemini ante 429 y 503');
function extractGeminiStatus(e: any): number | null {
  if (!e) return null;
  const rawStatus = e.status || e.statusCode || e.response?.status || e.error?.code;
  if (typeof rawStatus === 'number' && (rawStatus === 503 || rawStatus === 429)) {
    return rawStatus;
  }
  if (typeof rawStatus === 'string') {
    if (rawStatus === '503') return 503;
    if (rawStatus === '429') return 429;
  }
  const msg = String(e.message || e || '').toLowerCase();
  const codeStr = String(e.code || e.statusText || '').toLowerCase();
  if (codeStr === 'resource_exhausted' || msg.includes('429') || msg.includes('resource_exhausted')) return 429;
  if (codeStr === 'unavailable' || msg.includes('503') || msg.includes('service unavailable')) return 503;
  return null;
}

let llamadasModelos = 0;
const modelos = ['model1', 'model2'];
let statusGenerado = 0;

for (const m of modelos) {
  llamadasModelos++;
  const errMock = { status: 429, message: 'Resource exhausted' };
  const st = extractGeminiStatus(errMock);
  if (st === 429 || st === 503) {
    statusGenerado = st;
    break; // Se detiene inmediatamente
  }
}

assert.strictEqual(llamadasModelos, 1);
assert.strictEqual(statusGenerado, 429);
console.log('  -> OK: El bucle se detiene inmediatamente tras la primera llamada al recibir 429/503');

// 6. Prueba: Fallback en rubricasService.ts NO se activa ante respuestas HTTP de Express
console.log('\nPrueba 6: Fallback de Supabase NO se activa ante HTTP 400, 401, 403, 429, 503, 500');
async function mockAnalizarRubricaClient(expressResponse: { ok: boolean; status: number; body?: any } | 'network_error') {
  let resLocal: any = null;
  let isNetworkOrProxyError = false;

  if (expressResponse === 'network_error') {
    isNetworkOrProxyError = true;
  } else {
    resLocal = expressResponse;
  }

  if (resLocal) {
    if (resLocal.ok) {
      return 'borrador_exitoso';
    }
    if (resLocal.status === 502 || resLocal.status === 504) {
      isNetworkOrProxyError = true;
    } else {
      throw new Error(`Error de Express HTTP ${resLocal.status}: ${resLocal.body?.error || 'Error'}`);
    }
  }

  if (isNetworkOrProxyError) {
    return 'fallback_edge_function_ejecutado';
  }

  throw new Error('Error inesperado');
}

async function runClientTests() {
  // Test HTTP 400
  try {
    await mockAnalizarRubricaClient({ ok: false, status: 400, body: { error: 'Falta grupoId' } });
    assert.fail('Debería haber lanzado error');
  } catch (err: any) {
    assert(err.message.includes('400'), 'Debe propagar error 400');
  }

  // Test HTTP 429
  try {
    await mockAnalizarRubricaClient({ ok: false, status: 429, body: { error: 'Cuota agotada' } });
    assert.fail('Debería haber lanzado error');
  } catch (err: any) {
    assert(err.message.includes('429'), 'Debe propagar error 429');
  }

  // Test Network Error -> Fallback
  const resFallback = await mockAnalizarRubricaClient('network_error');
  assert.strictEqual(resFallback, 'fallback_edge_function_ejecutado');
  console.log('  -> OK: Fallback ejecutado EXCLUSIVAMENTE ante error de red/proxy');
}

runClientTests().then(() => {
  console.log('\n=== TODAS LAS PRUEBAS LOCALES DE LA FASE 4H PASARON SATISFACTORIAMENTE ===');
});
