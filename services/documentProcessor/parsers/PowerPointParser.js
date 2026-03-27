/**
 * PowerPointParser - Parser para archivos PowerPoint (PPTX)
 *
 * PPTX es un ZIP que contiene XMLs. Los slides estan en ppt/slides/slide{N}.xml
 * El texto de cada slide esta en tags <a:t> dentro del XML.
 * Utiliza adm-zip (ya instalado) para descomprimir y parsear.
 *
 * Nota: Solo soporta .pptx (Office 2007+). No soporta .ppt legacy (binario OLE).
 */

const BaseParser = require('./BaseParser');
const AdmZip = require('adm-zip');
const fs = require('fs').promises;
const path = require('path');

class PowerPointParser extends BaseParser {
  constructor(options = {}) {
    super(options);
    this.supportedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' // PPTX
    ];
    this.supportedExtensions = ['.pptx'];
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

    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);

      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();

      // Encontrar slides ordenados numericamente (slide1.xml, slide2.xml, ...)
      const slideEntries = entries
        .filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
        .sort((a, b) => {
          const numA = parseInt(a.entryName.match(/slide(\d+)/)[1]);
          const numB = parseInt(b.entryName.match(/slide(\d+)/)[1]);
          return numA - numB;
        });

      if (slideEntries.length === 0) {
        return this.createErrorResult('No se encontraron slides en el archivo PPTX');
      }

      // Extraer texto de cada slide
      const slideTexts = [];
      for (const entry of slideEntries) {
        const xml = entry.getData().toString('utf-8');
        const text = this.extractTextFromSlideXml(xml);
        if (text.trim()) {
          const slideNum = entry.entryName.match(/slide(\d+)/)[1];
          slideTexts.push(`--- Slide ${slideNum} ---\n${text}`);
        }
      }

      // Extraer notas si existen
      const noteTexts = [];
      const noteEntries = entries
        .filter(e => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(e.entryName))
        .sort((a, b) => {
          const numA = parseInt(a.entryName.match(/notesSlide(\d+)/)[1]);
          const numB = parseInt(b.entryName.match(/notesSlide(\d+)/)[1]);
          return numA - numB;
        });

      for (const entry of noteEntries) {
        const xml = entry.getData().toString('utf-8');
        const text = this.extractTextFromSlideXml(xml);
        if (text.trim()) {
          const noteNum = entry.entryName.match(/notesSlide(\d+)/)[1];
          noteTexts.push(`--- Notas Slide ${noteNum} ---\n${text}`);
        }
      }

      // Extraer imagenes de ppt/media/
      const images = this.extractMediaImages(entries);

      // Combinar todo el texto
      const allParts = [...slideTexts];
      if (noteTexts.length > 0) {
        allParts.push('\n=== NOTAS ===');
        allParts.push(...noteTexts);
      }

      const fullText = allParts.join('\n\n');
      const processingTime = Date.now() - startTime;

      return this.createResult({
        text: fullText,
        images,
        processingTime,
        pageCount: slideEntries.length,
        metadata: {
          format: 'PPTX',
          slideCount: slideEntries.length,
          hasNotes: noteTexts.length > 0,
          notesCount: noteTexts.length,
          imageCount: images.length,
          fileSize: stats.size
        }
      });
    } catch (error) {
      return this.createErrorResult(`Error procesando PowerPoint: ${error.message}`, error);
    }
  }

  /**
   * Extrae imagenes embebidas de ppt/media/ dentro del ZIP del PPTX.
   * Solo extrae formatos raster soportados por OpenAI Vision (png, jpg, gif, bmp).
   * Ignora formatos vectoriales (emf, wmf, svg) que no son procesables por IA.
   * @param {Array} entries - Entradas del ZIP
   * @returns {Array<{base64: string, mimeType: string, index: number, source: string}>}
   */
  extractMediaImages(entries) {
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff'
    };

    const mediaEntries = entries
      .filter(e => /^ppt\/media\//i.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName));

    const images = [];
    for (const entry of mediaEntries) {
      try {
        const ext = path.extname(entry.entryName).toLowerCase();
        const mimeType = mimeMap[ext];
        if (!mimeType) continue; // Saltar formatos no soportados (emf, wmf, svg)

        const buffer = entry.getData();
        if (!buffer || buffer.length === 0) continue;

        images.push({
          base64: buffer.toString('base64'),
          mimeType,
          index: images.length,
          source: entry.entryName
        });
      } catch (imgError) {
        console.warn(`[PowerPointParser] Error extrayendo imagen ${entry.entryName}: ${imgError.message}`);
      }
    }

    if (images.length > 0) {
      console.log(`[PowerPointParser] ${images.length} imagen(es) extraida(s) de ppt/media/`);
    }

    return images;
  }

  /**
   * Extrae texto de un XML de slide PPTX
   * Los textos estan en tags <a:t>contenido</a:t>
   * Los parrafos estan delimitados por <a:p>
   */
  extractTextFromSlideXml(xml) {
    const paragraphs = [];
    // Dividir por parrafos <a:p>...</a:p>
    const pMatches = xml.match(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/gi) || [];

    for (const pBlock of pMatches) {
      // Extraer todos los <a:t> dentro de este parrafo
      const tMatches = pBlock.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
      const texts = tMatches.map(t => {
        const content = t.replace(/<a:t[^>]*>/i, '').replace(/<\/a:t>/i, '');
        return this.decodeXmlEntities(content);
      });

      const line = texts.join('');
      if (line.trim()) {
        paragraphs.push(line.trim());
      }
    }

    return paragraphs.join('\n');
  }

  /**
   * Decodifica entidades XML comunes
   */
  decodeXmlEntities(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }
}

module.exports = PowerPointParser;
