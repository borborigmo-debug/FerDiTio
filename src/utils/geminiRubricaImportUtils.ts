/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mammoth from 'mammoth';

/**
 * Procesa y optimiza una fotografía reduciendo su resolución
 * al límite óptimo de legibilidad para Gemini (máx. 1600px) y comprimiendo a JPEG.
 * Utiliza URL.createObjectURL() para evitar crear cadenas Base64 gigantes en memoria
 * y libera siempre los recursos temporales mediante URL.revokeObjectURL().
 */
export async function optimizeImageForGemini(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ base64: string; mimeType: string }> {
  if (!file) {
    throw new Error('No se ha proporcionado ningún archivo para procesar.');
  }

  const isImageMime = file.type ? file.type.startsWith('image/') : false;
  const isImageExt = /\.(jpe?g|png|webp|bmp|gif|heic|heif)$/i.test(file.name || '');

  if (!isImageMime && !isImageExt) {
    throw new Error(`El archivo seleccionado (${file.name || 'desconocido'}) no es una imagen compatible (JPEG, PNG, WebP o HEIC).`);
  }

  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (urlErr: any) {
      reject(new Error(`No se pudo generar la URL de objeto para la imagen: ${urlErr?.message || urlErr}`));
      return;
    }

    const cleanup = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignorar
        }
        objectUrl = '';
      }
    };

    const img = new Image();

    img.onerror = () => {
      cleanup();
      reject(new Error(`No se pudo decodificar la imagen (${file.name}). Asegúrate de que el formato sea JPEG, PNG o WebP válido.`));
    };

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          cleanup();
          reject(new Error('La imagen no contiene dimensiones válidas para el análisis.'));
          return;
        }

        // Escalar si supera la dimensión máxima manteniendo la relación de aspecto
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
          cleanup();
          reject(new Error('No se pudo inicializar el contexto gráfico Canvas del navegador.'));
          return;
        }

        // Fondo blanco para imágenes transparentes (PNG) al convertir a JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const rawBase64 = dataUrl.split(',')[1] || '';

        cleanup();

        if (!rawBase64) {
          reject(new Error('La compresión gráfica de la imagen no generó datos válidos.'));
          return;
        }

        resolve({
          base64: rawBase64,
          mimeType: 'image/jpeg',
        });
      } catch (err: any) {
        cleanup();
        reject(new Error(`Fallo durante el procesamiento gráfico de la imagen: ${err?.message || err}`));
      }
    };

    img.src = objectUrl;
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
