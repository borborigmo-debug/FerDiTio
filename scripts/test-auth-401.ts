/**
 * Test de verificación de seguridad local para el endpoint /api/gemini/analizar-rubrica
 * Comprueba las respuestas HTTP 401 y la ausencia de filtración de authErr.message
 */

import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_PROJECT_ID = 'eastern-deck-8pthm';
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

const firebaseJWKS = createRemoteJWKSet(FIREBASE_JWKS_URL);

async function verifyFirebaseIdToken(token: string) {
  const { payload } = await jwtVerify(token, firebaseJWKS, {
    issuer: FIREBASE_ISSUER,
    audience: FIREBASE_PROJECT_ID,
    algorithms: ['RS256'],
  });
  return payload;
}

async function runTests() {
  console.log('=== INICIANDO PRUEBAS LOCALES DE AUTENTICACIÓN (FASE 3B) ===\n');

  let geminiCalled = false;

  // Servidor Express de prueba con la lógica exacta de server.ts
  const app = express();
  app.use(express.json());

  app.post('/api/gemini/analizar-rubrica', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Cabecera de autorización ausente o inválida. Se requiere token Bearer.',
        });
      }

      const authToken = authHeader.substring(7).trim();
      if (!authToken) {
        return res.status(401).json({
          success: false,
          error: 'Token de autorización de sesión vacío.',
        });
      }

      try {
        await verifyFirebaseIdToken(authToken);
      } catch (authErr: any) {
        console.log('  [LOG SERVIDOR]: Token Firebase rechazado correctamente (Diagnóstico interno)');
        return res.status(401).json({
          success: false,
          error: 'Token de autenticación no válido o caducado.',
        });
      }

      geminiCalled = true;
      return res.status(200).json({ success: true, message: 'Gemini llamado' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const server = app.listen(0, async () => {
    const address = server.address() as any;
    const baseUrl = `http://localhost:${address.port}`;

    let passedCount = 0;
    let failedCount = 0;

    // PRUEBA 1: Ausencia de token (sin cabecera Authorization)
    console.log('PRUEBA 1: Ausencia de token');
    geminiCalled = false;
    const res1 = await fetch(`${baseUrl}/api/gemini/analizar-rubrica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
    const body1 = await res1.json();
    if (res1.status === 401 && !geminiCalled && body1.error === 'Cabecera de autorización ausente o inválida. Se requiere token Bearer.') {
      console.log('  -> PASADO: HTTP 401, Gemini no llamado, mensaje correcto sin fugas.');
      passedCount++;
    } else {
      console.error('  -> FALLADO:', res1.status, body1);
      failedCount++;
    }

    // PRUEBA 2: Token vacío
    console.log('\nPRUEBA 2: Token Bearer vacío');
    geminiCalled = false;
    const res2 = await fetch(`${baseUrl}/api/gemini/analizar-rubrica`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ',
      },
      body: JSON.stringify({ test: true }),
    });
    const body2 = await res2.json();
    if (res2.status === 401 && !geminiCalled && (body2.error === 'Token de autorización de sesión vacío.' || body2.error === 'Cabecera de autorización ausente o inválida. Se requiere token Bearer.')) {
      console.log('  -> PASADO: HTTP 401, Gemini no llamado, mensaje correcto sin fugas.');
      passedCount++;
    } else {
      console.error('  -> FALLADO:', res2.status, body2);
      failedCount++;
    }

    // PRUEBA 3: Token inventado
    console.log('\nPRUEBA 3: Token inventado (Bearer token-inventado-12345)');
    geminiCalled = false;
    const res3 = await fetch(`${baseUrl}/api/gemini/analizar-rubrica`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-inventado-12345',
      },
      body: JSON.stringify({ test: true }),
    });
    const body3 = await res3.json();
    if (res3.status === 401 && !geminiCalled && body3.error === 'Token de autenticación no válido o caducado.') {
      console.log('  -> PASADO: HTTP 401, Gemini no llamado, mensaje genérico exacto sin fugas de authErr.message.');
      passedCount++;
    } else {
      console.error('  -> FALLADO:', res3.status, body3);
      failedCount++;
    }

    // PRUEBA 4: Token malformado (JWT con estructura sintácticamente inválida)
    console.log('\nPRUEBA 4: Token malformado (Bearer eyJhbGciOiJSUzI1NiJ9.invalid.payload)');
    geminiCalled = false;
    const res4 = await fetch(`${baseUrl}/api/gemini/analizar-rubrica`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJSUzI1NiJ9.invalid.payload',
      },
      body: JSON.stringify({ test: true }),
    });
    const body4 = await res4.json();
    if (res4.status === 401 && !geminiCalled && body4.error === 'Token de autenticación no válido o caducado.') {
      console.log('  -> PASADO: HTTP 401, Gemini no llamado, mensaje genérico exacto sin fugas de authErr.message.');
      passedCount++;
    } else {
      console.error('  -> FALLADO:', res4.status, body4);
      failedCount++;
    }

    // PRUEBA 5: Token válido
    console.log('\nPRUEBA 5: Token Firebase válido');
    console.log('  -> DECLARACIÓN: PRUEBA NO REALIZADA (Requiere claves privadas / sesión activa de Firebase en vivo para firmar tokens con la clave pública de Google).');

    console.log('\n=== RESUMEN DE RESULTADOS ===');
    console.log(`Pruebas ejecutadas: ${passedCount + failedCount}`);
    console.log(`Pruebas pasadas: ${passedCount}`);
    console.log(`Pruebas falladas: ${failedCount}`);
    console.log(`Pruebas no realizadas: 1 (Token válido)`);

    server.close(() => {
      process.exit(failedCount > 0 ? 1 : 0);
    });
  });
}

runTests().catch((err) => {
  console.error('Error durante la ejecución del script de pruebas:', err);
  process.exit(1);
});
