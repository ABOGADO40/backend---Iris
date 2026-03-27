/**
 * DocumentProcessorService - Orquestador principal de procesamiento de documentos
 *
 * Detecta automaticamente el tipo de documento y utiliza el parser apropiado
 */

const path = require('path');
const fs = require('fs').promises;
const PDFParser = require('./parsers/PDFParser');
const WordParser = require('./parsers/WordParser');
const ExcelParser = require('./parsers/ExcelParser');
const ImageParser = require('./parsers/ImageParser');
const WhatsAppParser = require('./parsers/WhatsAppParser');
const AudioParser = require('./parsers/AudioParser');
const VideoParser = require('./parsers/VideoParser');
const PowerPointParser = require('./parsers/PowerPointParser');
const TextCleaner = require('./utils/TextCleaner');

class DocumentProcessorService {
  constructor(options = {}) {
    this.options = {
      enableOCR: true,
      cleanText: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      tempDir: path.join(__dirname, '../../uploads/temp_processing'),
      ...options
    };

    // Inicializar parsers
    this.parsers = [
      new PDFParser(this.options),
      new WordParser(this.options),
      new ExcelParser(this.options),
      new ImageParser(this.options),
      new WhatsAppParser(this.options),
      new AudioParser(this.options),
      new VideoParser(this.options),
      new PowerPointParser(this.options)
    ];

    // Asegurar que existe el directorio temporal
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.options.tempDir, { recursive: true });
    } catch (error) {
      console.warn('No se pudo crear directorio temporal:', error.message);
    }
  }

  /**
   * Procesa un documento y extrae texto e imagenes
   * @param {string} filePath - Ruta al archivo
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<ProcessResult>}
   */
  async process(filePath, options = {}) {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);

      // Obtener informacion del archivo
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = this.getMimeType(ext);

      // Verificar tamano del archivo
      if (stats.size > mergedOptions.maxFileSize) {
        return this.createErrorResult(
          `Archivo demasiado grande: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${(mergedOptions.maxFileSize / 1024 / 1024).toFixed(2)}MB)`
        );
      }

      // Encontrar el parser apropiado
      const parser = this.findParser(filePath, mimeType);

      if (!parser) {
        // Si no hay parser especifico, intentar leer como texto plano
        return await this.processAsText(filePath, mergedOptions, startTime);
      }

      // Procesar con el parser encontrado
      const result = await parser.parse(filePath, mergedOptions);

      // Limpiar texto si esta habilitado
      if (result.success && mergedOptions.cleanText && result.text) {
        result.text = TextCleaner.clean(result.text);
      }

      // Agregar tiempo total de procesamiento
      const extraMeta = {
        totalProcessingTime: Date.now() - startTime,
        originalFilePath: filePath,
        fileExtension: ext,
        mimeType
      };
      result.metadata = { ...result.metadata, ...extraMeta };
      result.meta = result.metadata;

      return result;

    } catch (error) {
      return this.createErrorResult(`Error procesando documento: ${error.message}`, error);
    }
  }

  /**
   * Procesa multiples documentos en paralelo
   * @param {string[]} filePaths - Array de rutas de archivos
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<ProcessResult[]>}
   */
  async processMultiple(filePaths, options = {}) {
    const results = await Promise.allSettled(
      filePaths.map(filePath => this.process(filePath, options))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return this.createErrorResult(
        `Error procesando ${filePaths[index]}: ${result.reason?.message}`,
        result.reason
      );
    });
  }

  /**
   * Encuentra el parser apropiado para un archivo
   * @param {string} filePath - Ruta del archivo
   * @param {string} mimeType - Tipo MIME
   * @returns {BaseParser|null}
   */
  findParser(filePath, mimeType) {
    for (const parser of this.parsers) {
      if (parser.canParse(filePath, mimeType)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Intenta procesar un archivo como texto plano
   * @param {string} filePath - Ruta del archivo
   * @param {Object} options - Opciones
   * @param {number} startTime - Tiempo de inicio
   * @returns {Promise<ProcessResult>}
   */
  async processAsText(filePath, options, startTime) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      const meta = {
        parser: 'PlainText',
        format: 'text/plain',
        processingTime: Date.now() - startTime,
        fileSize: stats.size,
        wordCount: TextCleaner.countWords(content)
      };
      return {
        success: true,
        text: options.cleanText ? TextCleaner.clean(content) : content,
        images: [],
        audioText: [],
        frames: [],
        meta,
        metadata: meta,
        error: null
      };
    } catch (error) {
      return this.createErrorResult(
        `No se pudo procesar como texto: ${error.message}`,
        error
      );
    }
  }

  /**
   * Obtiene el tipo MIME basado en la extension
   * @param {string} extension - Extension del archivo
   * @returns {string}
   */
  getMimeType(extension) {
    const mimeTypes = {
      // PDF
      '.pdf': 'application/pdf',
      // Word
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      // Excel
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.csv': 'text/csv',
      // PowerPoint
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Imagenes
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.webp': 'image/webp',
      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/m4a',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.wma': 'audio/x-ms-wma',
      // Video
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.m4v': 'video/x-m4v',
      '.mpeg': 'video/mpeg',
      '.mpg': 'video/mpeg',
      // Otros
      '.txt': 'text/plain',
      '.zip': 'application/zip',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.json': 'application/json',
      '.xml': 'application/xml'
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Verifica si un formato es soportado
   * @param {string} filePath - Ruta del archivo
   * @returns {boolean}
   */
  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = this.getMimeType(ext);
    return this.findParser(filePath, mimeType) !== null || ext === '.txt';
  }

  /**
   * Obtiene los formatos soportados
   * @returns {Object}
   */
  getSupportedFormats() {
    const extensions = new Set();
    const mimeTypes = new Set();

    for (const parser of this.parsers) {
      parser.getSupportedExtensions().forEach(ext => extensions.add(ext));
      parser.getSupportedMimeTypes().forEach(mime => mimeTypes.add(mime));
    }

    // Agregar texto plano
    extensions.add('.txt');
    mimeTypes.add('text/plain');

    return {
      extensions: Array.from(extensions),
      mimeTypes: Array.from(mimeTypes)
    };
  }

  /**
   * Extrae solo las imagenes de un documento
   * @param {string} filePath - Ruta del archivo
   * @param {Object} options - Opciones
   * @returns {Promise<ImageData[]>}
   */
  async extractImages(filePath, options = {}) {
    const result = await this.process(filePath, options);
    return result.success ? result.images : [];
  }

  /**
   * Extrae solo el texto de un documento
   * @param {string} filePath - Ruta del archivo
   * @param {Object} options - Opciones
   * @returns {Promise<string>}
   */
  async extractText(filePath, options = {}) {
    const result = await this.process(filePath, options);
    return result.success ? result.text : '';
  }

  /**
   * Obtiene metadatos de un documento sin procesar completamente
   * @param {string} filePath - Ruta del archivo
   * @returns {Promise<Object>}
   */
  async getMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = this.getMimeType(ext);
      const parser = this.findParser(filePath, mimeType);

      return {
        success: true,
        filePath,
        fileName: path.basename(filePath),
        extension: ext,
        mimeType,
        size: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        created: stats.birthtime,
        modified: stats.mtime,
        isSupported: parser !== null,
        parserName: parser?.constructor.name || 'PlainText'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Formatea el tamano de archivo
   * @param {number} bytes - Tamano en bytes
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Crea un resultado de error
   * @param {string} message - Mensaje de error
   * @param {Error} originalError - Error original
   * @returns {ProcessResult}
   */
  createErrorResult(message, originalError = null) {
    return {
      success: false,
      text: '',
      images: [],
      audioText: [],
      frames: [],
      meta: {},
      metadata: {},
      error: {
        message,
        originalMessage: originalError?.message,
        stack: originalError?.stack
      }
    };
  }
}

/**
 * @typedef {Object} ProcessResult
 * @property {boolean} success - Si el procesamiento fue exitoso
 * @property {string} text - Texto extraido
 * @property {ImageData[]} images - Imagenes extraidas
 * @property {Object} metadata - Metadatos del documento
 * @property {Object|null} error - Informacion del error si fallo
 */

/**
 * @typedef {Object} ImageData
 * @property {string} base64 - Imagen en base64
 * @property {string} mimeType - Tipo MIME
 * @property {number} pageNumber - Numero de pagina
 * @property {number} index - Indice de la imagen
 * @property {string|null} ocrText - Texto extraido por OCR
 * @property {number|null} ocrConfidence - Confianza del OCR
 */

// Exportar instancia singleton
const documentProcessor = new DocumentProcessorService();

module.exports = {
  DocumentProcessorService,
  documentProcessor
};
