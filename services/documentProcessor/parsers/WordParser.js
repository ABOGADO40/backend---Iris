/**
 * WordParser - Parser para archivos Word (DOCX y DOC)
 *
 * Utiliza mammoth para DOCX y word-extractor para DOC
 */

const BaseParser = require('./BaseParser');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const fs = require('fs').promises;
const path = require('path');

class WordParser extends BaseParser {
  constructor(options = {}) {
    super(options);
    this.supportedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/msword' // DOC
    ];
    this.supportedExtensions = ['.docx', '.doc'];
    this.wordExtractor = new WordExtractor();
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
    const ext = path.extname(filePath).toLowerCase();

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);

      // Elegir el metodo de parsing segun la extension
      if (ext === '.docx') {
        return await this.parseDocx(filePath, startTime);
      } else if (ext === '.doc') {
        return await this.parseDoc(filePath, startTime);
      } else {
        return this.createErrorResult(`Extension no soportada: ${ext}`);
      }
    } catch (error) {
      return this.createErrorResult(`Error procesando Word: ${error.message}`, error);
    }
  }

  /**
   * Procesa archivos DOCX usando mammoth
   */
  async parseDocx(filePath, startTime) {
    try {
      const buffer = await fs.readFile(filePath);

      // Extraer texto plano
      const textResult = await mammoth.extractRawText({ buffer });

      // Extraer HTML para mejor formato
      const htmlResult = await mammoth.convertToHtml({ buffer });

      // Extraer imagenes embebidas
      const images = [];
      let imageIndex = 0;

      const imageOptions = {
        convertImage: mammoth.images.imgElement(async (image) => {
          try {
            const imageBuffer = await image.read('base64');
            images.push({
              base64: imageBuffer,
              mimeType: image.contentType || 'image/png',
              pageNumber: 1, // DOCX no tiene concepto de paginas
              index: imageIndex++,
              ocrText: null,
              ocrConfidence: null
            });
          } catch (imgError) {
            console.warn(`Error extrayendo imagen ${imageIndex}:`, imgError.message);
          }
          return { src: '' }; // Placeholder
        })
      };

      // Procesar con extraccion de imagenes
      await mammoth.convertToHtml({ buffer, ...imageOptions });

      const processingTime = Date.now() - startTime;
      const stats = await fs.stat(filePath);

      return this.createResult({
        text: textResult.value || '',
        images,
        processingTime,
        pageCount: null, // DOCX no tiene paginas definidas
        metadata: {
          format: 'DOCX',
          warnings: textResult.messages?.map(m => m.message) || [],
          htmlAvailable: !!htmlResult.value,
          fileSize: stats.size
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Procesa archivos DOC usando word-extractor
   */
  async parseDoc(filePath, startTime) {
    try {
      const document = await this.wordExtractor.extract(filePath);

      // Extraer diferentes partes del documento
      const body = document.getBody() || '';
      const headers = document.getHeaders() || '';
      const footers = document.getFooters() || '';
      const footnotes = document.getFootnotes() || '';
      const annotations = document.getAnnotations() || '';

      // Combinar todo el texto
      const allText = [
        headers,
        body,
        footers,
        footnotes,
        annotations
      ].filter(t => t.trim()).join('\n\n');

      const processingTime = Date.now() - startTime;
      const stats = await fs.stat(filePath);

      return this.createResult({
        text: allText,
        images: [], // word-extractor no extrae imagenes de DOC
        processingTime,
        pageCount: null,
        metadata: {
          format: 'DOC',
          hasHeaders: !!headers.trim(),
          hasFooters: !!footers.trim(),
          hasFootnotes: !!footnotes.trim(),
          hasAnnotations: !!annotations.trim(),
          fileSize: stats.size
        }
      });
    } catch (error) {
      throw error;
    }
  }
}

module.exports = WordParser;
