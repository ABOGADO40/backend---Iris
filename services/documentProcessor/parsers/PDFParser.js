/**
 * PDFParser - Parser para archivos PDF
 *
 * Extrae texto e imagenes de documentos PDF
 * Clasifica paginas (texto vs imagen/escaneada) para enviar solo lo necesario
 * Utiliza pdf-parse para extraccion de texto
 */

const BaseParser = require('./BaseParser');
const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');
const { renderPdfPages } = require('../utils/pdfToImages');

// Umbral minimo de caracteres para considerar que una pagina tiene texto util
const MIN_TEXT_CHARS = 30;

class PDFParser extends BaseParser {
  constructor(options = {}) {
    super(options);
    this.supportedMimeTypes = ['application/pdf'];
    this.supportedExtensions = ['.pdf'];
  }

  canParse(filePath, mimeType) {
    const ext = path.extname(filePath).toLowerCase();
    return (
      this.supportedMimeTypes.includes(mimeType) ||
      this.supportedExtensions.includes(ext)
    );
  }

  getSupportedMimeTypes() {
    return this.supportedMimeTypes;
  }

  getSupportedExtensions() {
    return this.supportedExtensions;
  }

  async parse(filePath, options = {}) {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);

      // Leer el archivo PDF
      const dataBuffer = await fs.readFile(filePath);

      // Detectar si el PDF contiene imagenes embebidas (escaneo rapido del binario)
      // Busca /Subtype /Image en el contenido raw del PDF
      const rawContent = dataBuffer.toString('latin1');
      const pdfHasImages = /\/Subtype\s*\/Image/.test(rawContent);

      // Extraer texto por pagina usando pagerender personalizado
      const pageTexts = {};
      let currentPage = 0;

      const pdfOptions = {
        max: 0, // Sin limite de paginas
        pagerender: function(pageData) {
          currentPage++;
          const pageNum = currentPage;
          return pageData.getTextContent().then(function(textContent) {
            const text = textContent.items.map(item => item.str).join(' ').trim();
            pageTexts[pageNum] = text;
            return text;
          });
        }
      };

      // Extraer texto del PDF (operacion segura, puro JS)
      let pdfData;
      try {
        pdfData = await pdfParse(dataBuffer, pdfOptions);
      } catch (textError) {
        console.warn(`[PDFParser] Error extrayendo texto: ${textError.message}`);
        pdfData = { text: '', numpages: 0, info: {} };
      }

      const totalPages = pdfData.numpages || 0;

      // Clasificar paginas: cuales tienen texto, cuales necesitan renderizado
      // Si el PDF tiene imagenes embebidas, renderizar TODAS las paginas con texto tambien
      const pagesNeedingImage = [];
      const pageClassification = [];

      for (let p = 1; p <= totalPages; p++) {
        const pageText = pageTexts[p] || '';
        const hasText = pageText.length >= MIN_TEXT_CHARS;
        // Si el PDF tiene imagenes: renderizar todas las paginas (texto + imagenes)
        // Si no tiene imagenes: solo renderizar paginas sin texto (escaneadas)
        const needsImage = !hasText || pdfHasImages;

        pageClassification.push({
          pageNumber: p,
          hasText,
          hasEmbeddedImages: pdfHasImages,
          needsImage,
          text: pageText
        });

        if (needsImage) {
          pagesNeedingImage.push(p);
        }
      }

      console.log(`[PDFParser] ${totalPages} paginas: ${pageClassification.filter(p => p.hasText).length} con texto, imagenes embebidas: ${pdfHasImages ? 'SI' : 'NO'}, ${pagesNeedingImage.length} a renderizar (paginas: ${pagesNeedingImage.join(', ') || 'ninguna'})`);

      // Renderizar paginas que necesitan imagen (sin texto O con imagenes embebidas)
      let images = [];
      let renderWarning = null;
      if (pagesNeedingImage.length > 0) {
        try {
          images = await renderPdfPages(filePath, {
            pages: pagesNeedingImage,
            scale: 1.5,
            quality: 80,
            maxDimension: 1024
          });
        } catch (renderError) {
          renderWarning = `No se pudieron renderizar ${pagesNeedingImage.length} pagina(s) del PDF (paginas: ${pagesNeedingImage.join(', ')}): ${renderError.message}`;
          console.error(`[PDFParser] ${renderWarning}`);
        }
      }

      const hasText = pdfData.text && pdfData.text.trim().length > 0;
      const hasImages = images.length > 0;

      // Si no hay texto ni imagenes, intentar OCR (renderizar todas las paginas)
      if (!hasText && !hasImages && mergedOptions.enableOCR) {
        try {
          return await this.parseWithOCR(filePath, mergedOptions, startTime, totalPages);
        } catch (ocrError) {
          console.warn(`[PDFParser] OCR tambien fallo: ${ocrError.message}`);
        }
      }

      // Construir texto estructurado por pagina
      const structuredText = this.buildStructuredText(pageClassification, images);

      const processingTime = Date.now() - startTime;

      return this.createResult({
        text: structuredText,
        images,
        processingTime,
        pageCount: totalPages,
        metadata: {
          title: pdfData.info?.Title || null,
          author: pdfData.info?.Author || null,
          subject: pdfData.info?.Subject || null,
          creator: pdfData.info?.Creator || null,
          producer: pdfData.info?.Producer || null,
          creationDate: pdfData.info?.CreationDate || null,
          modificationDate: pdfData.info?.ModDate || null,
          pdfVersion: pdfData.version || null,
          isEncrypted: pdfData.info?.IsAcroFormPresent || false,
          fileSize: dataBuffer.length,
          pagesWithText: totalPages - pagesNeedingImage.length,
          pagesAsImages: pagesNeedingImage.length,
          pageClassification,
          renderWarning
        }
      });
    } catch (error) {
      return this.createErrorResult(`Error procesando PDF: ${error.message}`, error);
    }
  }

  /**
   * Construye texto estructurado por pagina
   * Paginas con texto: incluye el texto con separador de pagina
   * Paginas sin texto (imagen): indica que es una imagen adjunta
   */
  buildStructuredText(pageClassification, images) {
    if (!pageClassification || pageClassification.length === 0) return '';

    // Si solo hay 1 pagina con texto y sin imagenes embebidas, retornar directo
    const textPages = pageClassification.filter(p => p.hasText);
    const anyNeedsImage = pageClassification.some(p => p.needsImage);
    if (textPages.length === 1 && pageClassification.length === 1 && !anyNeedsImage) {
      return textPages[0].text;
    }

    const parts = [];
    let imageIndex = 0;

    for (const page of pageClassification) {
      if (page.needsImage) {
        const hasImage = imageIndex < images.length;
        if (page.hasText && hasImage) {
          // Pagina con texto + imagenes embebidas
          parts.push(`--- Pagina ${page.pageNumber} [texto + imagen adjunta #${imageIndex + 1}] ---\n${page.text}`);
          imageIndex++;
        } else if (hasImage) {
          // Pagina sin texto, solo imagen (escaneada)
          parts.push(`--- Pagina ${page.pageNumber} [imagen adjunta #${imageIndex + 1}] ---`);
          imageIndex++;
        } else if (page.hasText) {
          // Tenia imagenes pero fallo el render, al menos tiene texto
          parts.push(`--- Pagina ${page.pageNumber} ---\n${page.text}`);
        } else {
          parts.push(`--- Pagina ${page.pageNumber} [sin contenido extraible] ---`);
        }
      } else {
        // Pagina solo con texto, sin imagenes
        parts.push(`--- Pagina ${page.pageNumber} ---\n${page.text}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Intenta extraer texto de un PDF usando OCR
   * Para PDFs escaneados o basados en imagenes
   */
  async parseWithOCR(filePath, options, startTime, totalPages) {
    try {
      // Renderizar todas las paginas como imagenes - Vision API leera el texto visual
      const allPages = [];
      for (let i = 1; i <= (totalPages || 10); i++) allPages.push(i);

      const images = await renderPdfPages(filePath, {
        pages: allPages,
        scale: 2.0, // Mayor escala para mejor legibilidad OCR
        quality: 85,
        maxDimension: 1024
      });

      const processingTime = Date.now() - startTime;

      // Construir texto indicando que son imagenes
      const textParts = images.map((img, idx) =>
        `--- Pagina ${img.pageNumber || (idx + 1)} [imagen adjunta #${idx + 1}] ---`
      );

      return this.createResult({
        text: textParts.join('\n\n') || '',
        images,
        processingTime,
        metadata: {
          isScanned: true,
          pagesRendered: images.length,
          pagesWithText: 0,
          pagesAsImages: images.length
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extrae metadatos basicos de un PDF sin procesar todo el contenido
   */
  async getMetadata(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer, { max: 1 }); // Solo primera pagina

      return {
        success: true,
        pageCount: pdfData.numpages,
        info: pdfData.info,
        version: pdfData.version
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PDFParser;
