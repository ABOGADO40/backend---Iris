/**
 * pdfRenderWorker.js - Proceso hijo aislado para renderizar PDFs
 *
 * Se ejecuta en un proceso separado via child_process.fork().
 * Si @napi-rs/canvas causa un Segmentation fault, solo este
 * proceso muere. El proceso principal (backend) sobrevive.
 *
 * Soporta renderizar paginas especificas (options.pages = [3, 5, 8])
 * o todas las paginas si no se especifica.
 */

const fs = require('fs').promises;

process.on('message', async (msg) => {
  const { filePath, options = {} } = msg;
  const { pages, scale = 1.5, quality = 80, maxDimension = 1024 } = options;

  try {
    const sharp = require('sharp');

    // Polyfills DOM que pdfjs-dist necesita en Node.js
    const canvas = await import('@napi-rs/canvas');
    if (!globalThis.DOMMatrix) globalThis.DOMMatrix = canvas.DOMMatrix;
    if (!globalThis.DOMPoint) globalThis.DOMPoint = canvas.DOMPoint;
    if (!globalThis.DOMRect) globalThis.DOMRect = canvas.DOMRect;
    if (!globalThis.Path2D) globalThis.Path2D = canvas.Path2D;

    // Registrar pdfjs-dist legacy
    const { definePDFJSModule } = await import('unpdf');
    await definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs'));

    const { getDocumentProxy, renderPageAsImage } = await import('unpdf');

    const buffer = await fs.readFile(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    // Determinar que paginas renderizar
    let targetPages;
    if (pages && Array.isArray(pages) && pages.length > 0) {
      // Solo renderizar paginas especificas (ya clasificadas como sin texto)
      targetPages = pages.filter(p => p >= 1 && p <= pdf.numPages);
    } else {
      // Renderizar todas (compatibilidad con llamadas sin clasificacion)
      targetPages = [];
      for (let i = 1; i <= pdf.numPages; i++) targetPages.push(i);
    }

    const images = [];

    for (const pageNum of targetPages) {
      try {
        const imageData = await renderPageAsImage(pdf, pageNum, {
          canvasImport: () => import('@napi-rs/canvas'),
          scale
        });

        const compressed = await sharp(Buffer.from(imageData))
          .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer();

        const metadata = await sharp(compressed).metadata();

        images.push({
          base64: compressed.toString('base64'),
          mimeType: 'image/jpeg',
          pageNumber: pageNum,
          index: images.length,
          width: metadata.width,
          height: metadata.height
        });
      } catch (pageError) {
        // Continuar con las demas paginas
      }
    }

    pdf.cleanup && await pdf.cleanup().catch(() => {});

    process.send({ success: true, images });
  } catch (error) {
    process.send({ success: false, error: error.message, images: [] });
  }

  // Salir limpiamente despues de enviar resultado
  process.exit(0);
});
