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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Aumentar límite de carga útil para imágenes en base64 de rúbricas fotografiadas
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Endpoint de análisis de rúbricas con Gemini
  app.post('/api/gemini/analizar-rubrica', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'No se ha configurado la variable de entorno GEMINI_API_KEY en el servidor.',
        });
      }

      const { origen, imagenBase64, mimeType, documentoTexto, criterios = [], grupoNombre } = req.body;

      if (origen === 'foto' && !imagenBase64) {
        return res.status(400).json({
          success: false,
          error: 'No se ha proporcionado la imagen para el análisis con Gemini.',
        });
      }

      if (origen === 'word' && !documentoTexto) {
        return res.status(400).json({
          success: false,
          error: 'No se ha proporcionado el contenido extraído del documento Word.',
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

      const promptInstrucciones = `Eres un asistente docente experto en evaluación educativa y diseño curricular de Lengua Castellana y Literatura (ESO y Bachillerato).
Tu misión es analizar la rúbrica o examen proporcionado (mediante ${origen === 'foto' ? 'fotografía de la matriz de evaluación' : 'contenido y tablas extraídas de un documento Word'}) y extraer una estructura normalizada de apartados e indicadores.

LISTA OFICIAL DE CRITERIOS DE EVALUACIÓN AUTORIZADOS PARA ESTE GRUPO:
${listaCriteriosTexto}

REGLAS OBLIGATORIAS:
1. SOLO puedes asociar a cada apartado códigos que pertenezcan ESTRICTAMENTE a la lista oficial anterior.
2. Si un apartado o actividad evalúa un criterio no listado o no hay coincidencia exacta, DEBES DEVOLVER una lista vacía de criterios para ese apartado: "criterios": [].
3. IDENTIFICADOR DE ACTIVIDADES (MUY IMPORTANTE):
   - "numero": el número o identificador EXACTO que figura en el documento o fotografía (por ejemplo "5.a", "5.b", "5.c", "2", "3.1").
   - NUNCA fuerces a que empiece por "1" por defecto si en el documento original empieza por otra numeración (ej. si la primera actividad es 5.a, ese debe ser el número).
   - Si una actividad tiene varios epígrafes (a, b, c...) y todos evalúan el mismo criterio, puedes consolidarlos en una actividad principal. Pero si un epígrafe evalúa otros criterios, DEBE aparecer como actividad aparte por defecto.
4. "titulo": el comienzo del enunciado y descripción clara del aspecto evaluado.
5. "peso": peso porcentual estimado (1 a 100), o null si no se deduce.
6. "descriptores": objeto con exactamente 4 niveles numéricos '1', '2', '3', '4':
   "1": Insuficiente / Inicial (1-4 pts)
   "2": En proceso / Suficiente (5-6 pts)
   "3": Conseguido / Notable (7-8 pts)
   "4": Avanzado / Sobresaliente (9-10 pts)
7. "tipo": sugiere el tipo de instrumento evaluativo ("ACTIVIDAD", "TRABAJO" o "EXAMEN").
8. "titulo": título sugerido para la rúbrica (ej: "Examen Tema 5: Morfología y Sintaxis").`;

      const parts: any[] = [];
      if (origen === 'foto') {
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
          text: promptInstrucciones + '\n\nAnaliza la fotografía de la rúbrica o examen adjunta y devuelve el JSON estructurado respetando la numeración original de los apartados.',
        });
      } else {
        parts.push({
          text: promptInstrucciones + `\n\nCONTENIDO EXTRAÍDO DEL DOCUMENTO WORD:\n${documentoTexto}\n\nDevuelve el JSON estructurado con la rúbrica normalizada.`,
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

      // Probar primero con gemini-3.5-flash-lite y fallback a gemini-3.5-flash
      let aiResponse: any = null;
      let lastErr: any = null;

      const modelosAProbar = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
      for (const modelo of modelosAProbar) {
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
            },
          });
          if (aiResponse?.text) {
            break;
          }
        } catch (err: any) {
          console.warn(`[server.ts] Error con modelo ${modelo}:`, err?.message || err);
          lastErr = err;
        }
      }

      if (!aiResponse?.text) {
        throw lastErr || new Error('No se obtuvo respuesta de Gemini');
      }

      const parsed = JSON.parse(aiResponse.text);

      // Normalizar apartados
      const codigosOficialesSet = new Set(
        Array.isArray(criterios) ? criterios.map((c: any) => String(c.codigo).trim().toLowerCase()) : []
      );

      const itemsNormalizados = (parsed.items || []).map((it: any, idx: number) => {
        // Filtrar exclusivamente criterios que existan en la lista oficial
        const criteriosFiltrados = (it.criterios || []).filter((cod: string) => {
          if (codigosOficialesSet.size === 0) return true;
          return codigosOficialesSet.has(String(cod).trim().toLowerCase());
        });

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
      console.error('[server.ts] Error en /api/gemini/analizar-rubrica:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Error interno al procesar la rúbrica con Gemini.',
      });
    }
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
