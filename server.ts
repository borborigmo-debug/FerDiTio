/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createRemoteJWKSet, jwtVerify } from 'jose';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración para verificación de ID Token de Firebase
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

function extractGeminiStatus(e: any): number | null {
  if (!e) return null;
  const rawStatus = e.status || e.statusCode || e.response?.status || e.error?.code;
  if (typeof rawStatus === 'number' && (rawStatus === 503 || rawStatus === 429)) {
    return rawStatus;
  }
  if (typeof rawStatus === 'string') {
    if (rawStatus === '503' || rawStatus.includes('503')) return 503;
    if (rawStatus === '429' || rawStatus.includes('429')) return 429;
  }

  const msg = String(e.message || e || '').toLowerCase();
  const codeStr = String(e.code || e.statusText || '').toLowerCase();
  const fullStr = `${codeStr} ${msg}`;

  if (
    fullStr.includes('503') ||
    fullStr.includes('unavailable') ||
    fullStr.includes('high demand') ||
    fullStr.includes('overloaded') ||
    fullStr.includes('try again later') ||
    fullStr.includes('spikes in demand')
  ) {
    return 503;
  }

  if (
    fullStr.includes('429') ||
    fullStr.includes('resource_exhausted') ||
    fullStr.includes('quota') ||
    fullStr.includes('rate limit') ||
    fullStr.includes('too many requests')
  ) {
    return 429;
  }

  return null;
}

function isTimeoutError(e: any): boolean {
  if (!e) return false;
  const name = String(e.name || e.constructor?.name || '');
  const msg = String(e.message || '');
  const code = String(e.code || '');

  const causeName = String(e.cause?.name || e.cause?.constructor?.name || '');
  const causeMsg = String(e.cause?.message || '');
  const causeCode = String(e.cause?.code || '');

  const fullStr = `${name} ${msg} ${code} ${causeName} ${causeMsg} ${causeCode}`.toLowerCase();

  if (
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    causeCode === 'UND_ERR_HEADERS_TIMEOUT' ||
    causeName === 'HeaderTimeoutError' ||
    causeName === 'HeadersTimeoutError' ||
    fullStr.includes('headers timeout') ||
    fullStr.includes('headerstimeouterror') ||
    fullStr.includes('und_err_headers_timeout') ||
    name === 'TimeoutError' ||
    causeName === 'TimeoutError' ||
    fullStr.includes('timeouterror') ||
    fullStr.includes('operation was aborted') ||
    (name === 'AbortError' && (fullStr.includes('timeout') || fullStr.includes('aborted') || fullStr.includes('cancel')))
  ) {
    return true;
  }

  return false;
}


async function startServer() {
  const app = express();
  console.log('[DIAGNÓSTICO] startServer se está ejecutando');
  const PORT = Number(process.env.PORT) || 3000;

  // Aumentar límite de carga útil para imágenes en base64 de rúbricas fotografiadas
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Middleware de diagnóstico seguro para peticiones API (sin registrar tokens, claves ni cuerpos)
  app.use('/api', (req, res, next) => {
    const cleanUrl = req.originalUrl.split('?')[0];
    const startMs = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startMs;
      const contentType = res.getHeader('content-type') || 'N/A';
      console.log(
        `[server.ts API] ${req.method} ${cleanUrl} -> HTTP ${res.statusCode} (${contentType}) [${durationMs}ms]`
      );
    });

    next();
  });

  app.get('/api/health-check-fernanditio', (_req, res) => {
    res.status(200).json({
      ok: true,
      source: 'server.ts'
    });
  });

  // Proxy inverso hacia la Edge Function 'fernanditio-data' en Supabase para evitar bloqueos CORS en el navegador
  app.all('/api/fernanditio-data*', async (req, res) => {
    console.log('[DIAGNÓSTICO PROXY]', req.method, req.originalUrl);
    try {
      const subpath = (req.params as any)[0] || '';
      const queryIndex = req.url.indexOf('?');
      const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : '';
      const targetUrl = `https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1/fernanditio-data${subpath}${queryString}`;

      console.log(`[DIAGNÓSTICO PROXY] ${req.method} -> Conectando a Supabase: ${targetUrl}`);

      const headers: Record<string, string> = {
        'Accept': (req.headers.accept as string) || 'application/json',
      };
      if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization as string;
      }
      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'] as string;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(10000),
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const remoteRes = await fetch(targetUrl, fetchOptions);
      const contentType = remoteRes.headers.get('content-type') || 'application/json';
      const text = await remoteRes.text();

      console.log(`[DIAGNÓSTICO PROXY] Supabase respondió con HTTP ${remoteRes.status}`);

      if (!remoteRes.ok) {
        const snippet = text.substring(0, 300).replace(/[\r\n]+/g, ' ');
        console.log(`[DIAGNÓSTICO PROXY ERROR BODY] HTTP ${remoteRes.status} (${contentType}): ${snippet}`);
      }

      res.status(remoteRes.status);
      res.setHeader('Content-Type', contentType);
      return res.send(text);
    } catch (err: any) {
      console.error('[DIAGNÓSTICO PROXY] Error de conexión con Supabase:', err?.message || err);

      const isTimeout =
        err?.name === 'AbortError' ||
        err?.name === 'TimeoutError' ||
        err?.code === 20 ||
        err?.message?.includes('aborted') ||
        err?.message?.includes('timeout');

      if (isTimeout) {
        return res.status(504).json({
          error: 'Tiempo de espera agotado al conectar con Supabase Edge Function (10s).',
        });
      }

      return res.status(502).json({
        error: `Error al conectar con la Edge Function de Supabase: ${err?.message || err}`,
      });
    }
  });

  // Endpoint de análisis de rúbricas con Gemini
  app.post('/api/gemini/analizar-rubrica', async (req, res) => {
    const globalStartTime = Date.now();
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

      // Verificación criptográfica del ID token de Firebase
      let tokenPayload: any;
      try {
        tokenPayload = await verifyFirebaseIdToken(authToken);
      } catch (authErr: any) {
        console.warn('[server.ts] Token Firebase rechazado por fallo de autenticación:', authErr?.message || authErr);
        return res.status(401).json({
          success: false,
          error: 'Token de autenticación no válido o caducado.',
        });
      }

      if (!tokenPayload || tokenPayload.email_verified !== true) {
        return res.status(401).json({
          success: false,
          error: 'El correo electrónico del usuario no ha sido verificado.',
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'No se ha configurado la variable de entorno GEMINI_API_KEY en el servidor.',
        });
      }

      const {
        grupoId,
        origen,
        imagenBase64,
        mimeType,
        documentoTexto,
        promptTexto,
        pdfBase64,
        grupoNombre,
        evaluarOrtografia = false,
        evaluarPresentacion = false,
        modoEspecifico,
      } = req.body;

      if (!grupoId || typeof grupoId !== 'string' || !grupoId.trim()) {
        return res.status(400).json({
          success: false,
          error: 'El parámetro grupoId es obligatorio.',
        });
      }

      const cleanGrupoId = grupoId.trim();
      let criterios: any[] = [];

      // Verificar pertenencia del grupo al profesor y recuperar sus criterios oficiales de Supabase
      try {
        const checkUrl = `https://bdtkdyzmpbijvwwsbxpa.supabase.co/functions/v1/fernanditio-data?grupoId=${encodeURIComponent(cleanGrupoId)}`;
        const checkRes = await fetch(checkUrl, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!checkRes.ok) {
          let errText = 'El grupo especificado no existe o no pertenece al docente autenticado.';
          try {
            const errJson = await checkRes.json();
            if (errJson?.error) errText = errJson.error;
          } catch {}
          const statusToReturn = (checkRes.status >= 400 && checkRes.status < 600) ? checkRes.status : 500;
          return res.status(statusToReturn).json({
            success: false,
            error: errText,
          });
        }

        const remoteData = await checkRes.json();
        if (!remoteData || !Array.isArray(remoteData.criterios)) {
          return res.status(500).json({
            success: false,
            error: 'Respuesta inválida de Supabase al recuperar los criterios del grupo.',
          });
        }

        criterios = remoteData.criterios;
      } catch (checkErr: any) {
        console.error('[server.ts] Error al verificar el grupo en Supabase:', checkErr?.message || checkErr);
        return res.status(500).json({
          success: false,
          error: 'Error de conexión al verificar la propiedad del grupo y recuperar sus criterios.',
        });
      }

      // Preparar lista oficial de criterios del grupo para guiar la concordancia curricular
      const listaCriteriosTexto = Array.isArray(criterios) && criterios.length > 0
        ? criterios.map((c: any) => `- Código: "${c.codigo}" | Descripción: "${c.descripcion}"`).join('\n')
        : 'No hay lista previa especificada.';

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      let instruccionesAdicionales = '';
      if (evaluarOrtografia) {
        instruccionesAdicionales += '\n- INCLUIR OBLIGATORIAMENTE APARTADO: Genera un apartado específico titulado "Ortografía y expresión escrita" para evaluar la corrección ortográfica, gramatical y sintáctica, asociándolo a los criterios oficiales del grupo que correspondan a la expresión escrita u ortografía.';
      }
      if (evaluarPresentacion) {
        instruccionesAdicionales += '\n- INCLUIR OBLIGATORIAMENTE APARTADO: Genera un apartado específico titulado "Presentación y formato" para evaluar el orden, la limpieza, la legibilidad y la maquetación, asociándolo a los criterios oficiales del grupo que correspondan.';
      }

      const promptInstrucciones = modoEspecifico === 'ortografia'
        ? `Eres un asistente docente experto en evaluación educativa de Lengua Castellana y Literatura.
Genera un apartado de evaluación único para "Ortografía y expresión escrita" en una rúbrica analítica.
LISTA OFICIAL DE CRITERIOS DE EVALUACIÓN AUTORIZADOS PARA ESTE GRUPO:
${listaCriteriosTexto}

REGLAS:
1. "titulo": "Ortografía y expresión escrita"
2. "criterios": Asocia exclusivamente códigos de la lista oficial de criterios del grupo que correspondan a la corrección ortográfica, gramatical o sintáctica (o [] si no hay coincidencia).
3. "descriptores": Descriptores precisos en español para los niveles '1', '2', '3', '4':
   "1": Inicial/Insuficiente (Frecuentes errores ortográficos y gramaticales que dificultan la comprensión)
   "2": En proceso/Suficiente (Ocasionales errores ortográficos o de puntuación que no impiden la lectura)
   "3": Conseguido/Notable (Prácticamente sin errores ortográficos, sintaxis correcta)
   "4": Avanzado/Sobresaliente (Ortografía e higiene lingüística impecable, vocabulario preciso)
4. "peso": 100
5. "numero": "1"`
        : modoEspecifico === 'presentacion'
        ? `Eres un asistente docente experto en evaluación educativa de Lengua Castellana y Literatura.
Genera un apartado de evaluación único para "Presentación y formato" en una rúbrica analítica.
LISTA OFICIAL DE CRITERIOS DE EVALUACIÓN AUTORIZADOS PARA ESTE GRUPO:
${listaCriteriosTexto}

REGLAS:
1. "titulo": "Presentación y formato"
2. "criterios": Asocia exclusivamente códigos de la lista oficial de criterios del grupo que correspondan a la presentación, orden, maquetación o limpieza (o [] si no hay coincidencia).
3. "descriptores": Descriptores precisos en español para los niveles '1', '2', '3', '4':
   "1": Inicial/Insuficiente (Presentación descuidada, sucia, desorganizada o con tipografía ilegible)
   "2": En proceso/Suficiente (Presentación aceptable, respeta márgenes y estructura básica)
   "3": Conseguido/Notable (Presentación limpia, bien estructurada, pulcra y cuidada)
   "4": Avanzado/Sobresaliente (Excelente maquetación, formato profesional, impecable orden y pulcritud)
4. "peso": 100
5. "numero": "1"`
        : `Eres un asistente docente experto en evaluación educativa y diseño curricular de Lengua Castellana y Literatura (ESO y Bachillerato).
Tu misión es estructurar y normalizar una rúbrica de evaluación pedagógica, vinculando cada apartado exclusivamente a los criterios oficiales del grupo indicados a continuación.

LISTA OFICIAL DE CRITERIOS DE EVALUACIÓN AUTORIZADOS PARA ESTE GRUPO:
${listaCriteriosTexto}

REGLAS OBLIGATORIAS:
1. SOLO puedes asociar a cada apartado códigos que pertenezcan ESTRICTAMENTE a la lista oficial anterior.
2. Si un apartado o actividad evalúa un aspecto no contemplado o no hay coincidencia exacta con los criterios del grupo, DEBES DEVOLVER una lista vacía de criterios para ese apartado: "criterios": [].
3. IDENTIFICADOR DE ACTIVIDADES:
   - "numero": el identificador o número del apartado (ej. "1", "2.a", "3.1"). Conserva la numeración original si proviene de un archivo o fotografía.
   - Si se diseña desde una petición o prompt de texto, enumera secuencialmente ("1", "2", "3"...).
4. "titulo": enunciado claro y descriptivo del aspecto, ejercicio o competencia evaluada en ese apartado.
5. "peso": peso porcentual (1 a 100) o null.
6. "descriptores": objeto con exactamente 4 niveles numéricos '1', '2', '3', '4':
   "1": Insuficiente / Inicial (1-4 pts)
   "2": En proceso / Suficiente (5-6 pts)
   "3": Conseguido / Notable (7-8 pts)
   "4": Avanzado / Sobresaliente (9-10 pts)
7. "tipo": sugiere el tipo de instrumento evaluativo ("ACTIVIDAD", "TRABAJO" o "EXAMEN").
8. "titulo": título descriptivo sugerido para la rúbrica.${instruccionesAdicionales}`;

      const parts: any[] = [];

      if (modoEspecifico) {
        parts.push({
          text: promptInstrucciones + '\n\nDevuelve el JSON estructurado con exactamente este apartado y los criterios oficiales del grupo asociados.',
        });
      } else if (origen === 'foto' || (imagenBase64 && mimeType?.startsWith('image/'))) {
        let cleanBase64 = String(imagenBase64).trim();
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }

        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType || 'image/jpeg',
          },
        });
        parts.push({
          text: promptInstrucciones + '\n\nAnaliza la fotografía o imagen adjunta y devuelve el JSON estructurado con la rúbrica normalizada y los criterios oficiales asociados.',
        });
      } else if (pdfBase64 || (imagenBase64 && mimeType === 'application/pdf')) {
        let cleanBase64 = String(pdfBase64 || imagenBase64).trim();
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }

        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: 'application/pdf',
          },
        });
        parts.push({
          text: promptInstrucciones + '\n\nAnaliza el documento PDF adjunto y devuelve el JSON estructurado con la rúbrica normalizada y los criterios oficiales asociados.',
        });
      } else if (documentoTexto) {
        parts.push({
          text: promptInstrucciones + `\n\nCONTENIDO EXTRAÍDO DEL DOCUMENTO:\n${documentoTexto}\n\nDevuelve el JSON estructurado con la rúbrica normalizada y los criterios oficiales asociados.`,
        });
      } else if (promptTexto) {
        parts.push({
          text: promptInstrucciones + `\n\nPLANTEAMIENTO DEL PROFESOR / DESCRIPCIÓN DE LA RÚBRICA DESEADA:\n${promptTexto}\n\nDiseña y devuelve el JSON estructurado con una propuesta completa de rúbrica, indicadores, descriptores y criterios oficiales adecuados a esta propuesta.`,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'No se ha proporcionado material o prompt para diseñar la rúbrica con Gemini.',
        });
      }

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          titulo: { type: Type.STRING },
          tipo: { type: Type.STRING, enum: ['ACTIVIDAD', 'TRABAJO', 'EXAMEN'] },
          descripcion: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                numero: { type: Type.STRING },
                titulo: { type: Type.STRING },
                peso: { type: Type.NUMBER },
                criterios: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                descriptores: {
                  type: Type.OBJECT,
                  properties: {
                    '1': { type: Type.STRING },
                    '2': { type: Type.STRING },
                    '3': { type: Type.STRING },
                    '4': { type: Type.STRING },
                  },
                  required: ['1', '2', '3', '4'],
                },
              },
              required: ['titulo', 'criterios', 'descriptores'],
            },
          },
        },
        required: ['titulo', 'tipo', 'items'],
      };

      // Presupuesto de tiempo global para la operación de análisis (25 segundos)
      const GLOBAL_BUDGET_MS = 25000;
      const MARGIN_SAFETY_MS = 1000; // Reserva de 1s para procesamiento de respuesta y envío HTTP
      const MAX_MODEL1_TIMEOUT_MS = 14000;
      const MIN_MODEL2_TIME_NEEDED_MS = 3000;

      let aiResponse: any = null;
      let lastErr: any = null;

      const modelosAProbar = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
      for (let i = 0; i < modelosAProbar.length; i++) {
        const modelo = modelosAProbar[i];
        const elapsedNow = Date.now() - globalStartTime;
        const totalRemaining = GLOBAL_BUDGET_MS - elapsedNow - MARGIN_SAFETY_MS;

        if (totalRemaining <= (i === 0 ? 3000 : MIN_MODEL2_TIME_NEEDED_MS)) {
          console.warn(`[server.ts] Presupuesto global agotado (${elapsedNow}ms transcurridos). Omitiendo intento con modelo ${modelo}.`);
          if (!lastErr) {
            lastErr = new Error('TIEMPO_GLOBAL_AGOTADO');
          }
          break;
        }

        let timeoutModelo = totalRemaining;
        if (i === 0) {
          timeoutModelo = Math.min(MAX_MODEL1_TIMEOUT_MS, totalRemaining);
        }

        console.log(`[server.ts] Intentando modelo ${modelo} con timeout de ${timeoutModelo}ms (transcurridos: ${elapsedNow}ms)`);

        try {
          aiResponse = await ai.models.generateContent({
            model: modelo,
            contents: [
              {
                role: 'user',
                parts,
              },
            ],
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema,
              abortSignal: AbortSignal.timeout(timeoutModelo),
              httpOptions: {
                timeout: timeoutModelo,
              },
            },
          });
          if (aiResponse?.text) {
            break;
          }
        } catch (err: any) {
          lastErr = err;
          const errType = err?.constructor?.name || err?.name || typeof err || 'UnknownError';
          const errMsg = typeof err?.message === 'string' ? err.message : String(err || 'Sin mensaje');
          let causeStr = 'N/A';
          if (err?.cause) {
            const c = err.cause;
            if (typeof c === 'object' && c !== null) {
              const cName = c.name || c.constructor?.name || 'Cause';
              const cMsg = typeof c.message === 'string' ? c.message : String(c);
              const cCode = c.code ? ` (code: ${c.code})` : '';
              causeStr = `${cName}: ${cMsg}${cCode}`;
            } else {
              causeStr = String(c);
            }
          }
          const stackStr = typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 3).join(' | ') : 'Sin stack';

          const timedOut = isTimeoutError(err);
          console.warn(`[server.ts] Error con modelo ${modelo}: ${errMsg} [tipo: ${errType}] [causa: ${causeStr}] [timeout: ${timedOut}] [stack: ${stackStr}]`);

          const status = extractGeminiStatus(err);
          if (status === 429) {
            console.warn(`[server.ts] Deteniendo reintentos de Gemini inmediatamente por estado HTTP 429 (cuota agotada)`);
            break;
          }

          if (status === 503) {
            console.warn(`[server.ts] Modelo ${modelo} no disponible por alta demanda (HTTP 503). Intentando siguiente modelo si hay presupuesto...`);
            continue;
          }

          if (timedOut) {
            console.warn(`[server.ts] Modelo ${modelo} agotó su tiempo límite de ${timeoutModelo}ms. Intentando siguiente modelo si hay presupuesto...`);
            continue;
          }
        }
      }

      if (!aiResponse?.text) {
        const totalElapsed = Date.now() - globalStartTime;
        const isTimeout = isTimeoutError(lastErr) || lastErr?.message === 'TIEMPO_GLOBAL_AGOTADO' || totalElapsed >= 24000;

        if (isTimeout) {
          return res.status(504).json({
            success: false,
            error: 'El servicio de Inteligencia Artificial tardó demasiado tiempo en procesar la rúbrica (tiempo límite de 25s superado). Por favor, reduce la resolución de la foto o reintenta en unos instantes.',
            code: 504,
          });
        }

        throw lastErr || new Error('No se obtuvo respuesta de Gemini');
      }

      const parsed = JSON.parse(aiResponse.text);

      // Normalizar apartados
      const codigosOficialesSet = new Set(
        Array.isArray(criterios)
          ? criterios
              .map((c: any) => (c?.codigo ? String(c.codigo).trim().toLowerCase() : ''))
              .filter(Boolean)
          : []
      );

      const itemsNormalizados = (parsed.items || []).map((it: any, idx: number) => {
        // Filtrar exclusivamente criterios que existan en la lista oficial
        // Si la lista oficial de criterios está vacía, los ítems resultantes tendrán criterios: []
        let criteriosFiltrados: string[] = [];
        if (codigosOficialesSet.size > 0 && Array.isArray(it.criterios)) {
          criteriosFiltrados = it.criterios.filter((cod: string) => {
            if (!cod || typeof cod !== 'string') return false;
            return codigosOficialesSet.has(cod.trim().toLowerCase());
          });
        }

        return {
          id: `borrador_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          numero: it.numero || String(idx + 1),
          titulo: it.titulo || `Apartado ${idx + 1}`,
          peso: typeof it.peso === 'number' && !isNaN(it.peso) ? it.peso : null,
          criterios: criteriosFiltrados,
          criteriosPendientes: criteriosFiltrados.length === 0,
          descriptores: it.descriptores || {
            '1': 'Nivel Inicial / Insuficiente',
            '2': 'Nivel En proceso / Suficiente',
            '3': 'Nivel Conseguido / Notable',
            '4': 'Nivel Avanzado / Sobresaliente',
          },
        };
      });

      return res.json({
        success: true,
        borrador: {
          titulo: parsed.titulo || 'Nueva Rúbrica Analítica',
          tipo: parsed.tipo || 'ACTIVIDAD',
          descripcion: parsed.descripcion || null,
          items: itemsNormalizados,
          totalCriteriosDisponibles: Array.isArray(criterios) ? criterios.length : 0,
        },
      });
    } catch (err: any) {
      const totalElapsed = Date.now() - globalStartTime;
      const isTimeout = isTimeoutError(err) || err?.message === 'TIEMPO_GLOBAL_AGOTADO' || totalElapsed >= 24000;

      if (isTimeout) {
        console.warn(`[server.ts] Respondiendo HTTP 504 JSON por tiempo de espera agotado (${totalElapsed}ms transcurridos)`);
        return res.status(504).json({
          success: false,
          error: 'El servicio de Inteligencia Artificial tardó demasiado tiempo en procesar la rúbrica (tiempo límite de 25s superado). Por favor, reduce la resolución de la foto o reintenta en unos instantes.',
          code: 504,
        });
      }

      const errType = err?.constructor?.name || err?.name || typeof err || 'UnknownError';
      const errMsg = typeof err?.message === 'string' ? err.message : String(err || 'Sin mensaje');
      let causeStr = 'N/A';
      if (err?.cause) {
        const c = err.cause;
        if (typeof c === 'object' && c !== null) {
          const cName = c.name || c.constructor?.name || 'Cause';
          const cMsg = typeof c.message === 'string' ? c.message : String(c);
          const cCode = c.code ? ` (code: ${c.code})` : '';
          causeStr = `${cName}: ${cMsg}${cCode}`;
        } else {
          causeStr = String(c);
        }
      }
      console.error(`[server.ts] Error en /api/gemini/analizar-rubrica: ${errMsg} [tipo: ${errType}] [causa: ${causeStr}]`);

      const geminiStatus = extractGeminiStatus(err);
      if (geminiStatus === 503 || geminiStatus === 429) {
        const mensajeUsuario =
          geminiStatus === 503
            ? 'El servicio de IA (Gemini) está experimentando alta demanda en este momento (503). Por favor, reinténtalo pasados unos instantes.'
            : 'Se ha alcanzado el límite de peticiones de la IA (429). Por favor, espera unos momentos antes de reintentar.';

        return res.status(geminiStatus).json({
          success: false,
          error: mensajeUsuario,
          code: geminiStatus,
        });
      }

      return res.status(500).json({
        success: false,
        error: err?.message || 'Error interno al procesar la rúbrica con Gemini.',
      });
    }
  });

  // Manejador final para peticiones /api/* no atendidas previamente por Express
  // Impide que cualquier ruta o método API no reconocido caiga en vite.middlewares y reciba index.html
  app.all('/api/*', (req, res) => {
    const cleanPath = req.originalUrl.split('?')[0];
    return res.status(404).json({
      success: false,
      error: `Ruta o método API no reconocido en el servidor local: ${req.method} ${cleanPath}`,
    });
  });

  // Configuración de Vite / estáticos
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(__dirname, 'dist'))) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Fernanditio] Servidor en ejecución en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[server.ts] Error fatal al iniciar servidor:', err);
  process.exit(1);
});
