/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mammoth from 'mammoth';

/**
 * Procesa y optimiza una fotografía (desde cámara o archivo) reduciendo su resolución
 * al límite óptimo de legibilidad para Gemini (máx. 1600px) y comprimiendo a JPEG.
 * Evita desbordamiento de red y respeta la nitidez del texto.
 */
export async function optimizeImageForGemini(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    // Si no es imagen, rechazar inmediatamente
    if (!file.type.startsWith('image/')) {
      reject(new Error(`El archivo seleccionado (${file.name}) no es una imagen válida.`));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen seleccionada.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Escalar si supera la dimensión máxima
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto gráfico para procesar la imagen.'));
          return;
        }

        // Fondo blanco para imágenes transparentes (PNG) al convertir a JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const rawBase64 = dataUrl.split(',')[1] || '';

        resolve({
          base64: rawBase64,
          mimeType: 'image/jpeg',
        });
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Extrae el contenido y las tablas de un documento Word (.docx) utilizando mammoth en el navegador.
 * Conserva la estructura de tablas HTML para que Gemini identifique filas y columnas de la rúbrica.
 */
export async function extractDocxTextAndTables(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    throw new Error('El archivo seleccionado debe tener extensión .docx (Microsoft Word).');
  }

  const arrayBuffer = await file.arrayBuffer();

  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const htmlContent = result.value ? result.value.trim() : '';

    if (!htmlContent) {
      // Fallback a texto sin formato si HTML viene vacío
      const textResult = await mammoth.extractRawText({ arrayBuffer });
      const rawText = textResult.value ? textResult.value.trim() : '';
      if (!rawText) {
        throw new Error('El documento Word está vacío o no contiene texto legible.');
      }
      return rawText;
    }

    return htmlContent;
  } catch (err: any) {
    console.error('[docxUtils] Error al parsear docx con mammoth:', err);
    throw new Error(`No se pudo extraer el contenido del documento Word: ${err?.message || 'Error de lectura'}`);
  }
}
