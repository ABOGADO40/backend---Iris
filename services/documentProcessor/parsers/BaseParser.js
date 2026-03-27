/**
 * BaseParser - Clase base abstracta para todos los parsers de documentos
 *
 * Define la interfaz comun que deben implementar todos los parsers
 */

class BaseParser {
  constructor(options = {}) {
    this.options = {
      enableOCR: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB default
      ...options
    };
  }

  /**
   * Verifica si este parser puede procesar el archivo
   * @param {string} filePath - Ruta del archivo
   * @param {string} mimeType - Tipo MIME del archivo
   * @returns {boolean}
   */
  canParse(filePath, mimeType) {
    throw new Error('Method canParse() must be implemented by subclass');
  }

  /**
   * Procesa el archivo y extrae contenido
   * @param {string} filePath - Ruta del archivo
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<ParseResult>}
   */
  async parse(filePath, options = {}) {
    throw new Error('Method parse() must be implemented by subclass');
  }

  /**
   * Obtiene los tipos MIME soportados por este parser
   * @returns {string[]}
   */
  getSupportedMimeTypes() {
    throw new Error('Method getSupportedMimeTypes() must be implemented by subclass');
  }

  /**
   * Obtiene las extensiones de archivo soportadas
   * @returns {string[]}
   */
  getSupportedExtensions() {
    throw new Error('Method getSupportedExtensions() must be implemented by subclass');
  }

  /**
   * Crea un resultado de parsing estandar
   * @param {Object} data - Datos del resultado
   * @returns {ParseResult}
   */
  createResult(data) {
    const meta = {
      parser: this.constructor.name,
      processingTime: data.processingTime || 0,
      pageCount: data.pageCount || null,
      wordCount: data.text ? data.text.split(/\s+/).filter(w => w).length : 0,
      hasImages: (data.images?.length || 0) > 0,
      ...data.metadata
    };
    return {
      success: true,
      text: data.text || '',
      images: data.images || [],
      audioText: data.audioText || [],
      frames: data.frames || [],
      meta,
      metadata: meta,
      error: null
    };
  }

  /**
   * Crea un resultado de error
   * @param {string} message - Mensaje de error
   * @param {Error} originalError - Error original
   * @returns {ParseResult}
   */
  createErrorResult(message, originalError = null) {
    const meta = { parser: this.constructor.name };
    return {
      success: false,
      text: '',
      images: [],
      audioText: [],
      frames: [],
      meta,
      metadata: meta,
      error: {
        message,
        originalMessage: originalError?.message,
        stack: originalError?.stack
      }
    };
  }
}

/**
 * @typedef {Object} ParseResult
 * @property {boolean} success - Si el parsing fue exitoso
 * @property {string} text - Texto extraido del documento
 * @property {ImageData[]} images - Imagenes extraidas (documento)
 * @property {string[]} audioText - Segmentos de transcripcion de audio
 * @property {ImageData[]} frames - Frames extraidos de video
 * @property {Object} meta - Metadatos del documento (formato canonico)
 * @property {Object} metadata - Alias de meta (retrocompatibilidad)
 * @property {Object|null} error - Informacion del error si fallo
 */

/**
 * @typedef {Object} ImageData
 * @property {string} base64 - Imagen en base64
 * @property {string} mimeType - Tipo MIME de la imagen
 * @property {number} pageNumber - Numero de pagina donde se encontro
 * @property {number} index - Indice de la imagen en el documento
 * @property {string} ocrText - Texto extraido por OCR (si aplica)
 * @property {number} ocrConfidence - Confianza del OCR (0-100)
 * @property {number} width - Ancho de la imagen
 * @property {number} height - Alto de la imagen
 */

module.exports = BaseParser;
