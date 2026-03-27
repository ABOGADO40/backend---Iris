/**
 * VideoParser - Parser para archivos de video
 *
 * Procesa archivos de video extrayendo:
 * - Transcripcion del audio (Whisper API)
 * - Frames clave para analisis visual (Vision API)
 *
 * Soporta formatos: .mp4, .avi, .mkv, .mov, .webm, .wmv, .flv, .m4v
 */

const path = require('path');
const fs = require('fs').promises;
const BaseParser = require('./BaseParser');
const { videoProcessingService } = require('../../videoProcessingService');

class VideoParser extends BaseParser {
  constructor(options = {}) {
    super(options);

    this.supportedExtensions = [
      '.mp4',
      '.avi',
      '.mkv',
      '.mov',
      '.webm',
      '.wmv',
      '.flv',
      '.m4v',
      '.mpeg',
      '.mpg'
    ];

    this.supportedMimeTypes = [
      'video/mp4',
      'video/x-msvideo',
      'video/avi',
      'video/x-matroska',
      'video/quicktime',
      'video/webm',
      'video/x-ms-wmv',
      'video/x-flv',
      'video/x-m4v',
      'video/mpeg'
    ];

    this.options = {
      frameInterval: 30,   // Segundos entre frames
      maxFrames: 10,       // Maximo de frames a extraer
      analyzeFrames: true, // Analizar frames con Vision API
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
    const ext = path.extname(filePath).toLowerCase();

    // Verificar por extension
    if (this.supportedExtensions.includes(ext)) {
      return true;
    }

    // Verificar por MIME type
    if (mimeType && this.supportedMimeTypes.includes(mimeType.toLowerCase())) {
      return true;
    }

    return false;
  }

  /**
   * Procesa el archivo de video
   * @param {string} filePath - Ruta del archivo
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<ParseResult>}
   */
  async parse(filePath, options = {}) {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);
      const stats = await fs.stat(filePath);

      console.log(`[VideoParser] Procesando archivo de video: ${path.basename(filePath)}`);

      // Procesar el video
      const result = await videoProcessingService.processVideo(filePath, {
        frameInterval: mergedOptions.frameInterval,
        maxFrames: mergedOptions.maxFrames,
        analyzeFrames: mergedOptions.analyzeFrames,
        language: options.language,
        serviceType: options.serviceType
      });

      if (!result.success) {
        return this.createErrorResult(
          `Error procesando video: ${result.error}`,
          new Error(result.error)
        );
      }

      // Formatear el texto con metadata
      let formattedText = '';

      // Agregar informacion del archivo al inicio
      const headerInfo = [
        `[ANALISIS DE VIDEO]`,
        `Archivo: ${path.basename(filePath)}`,
        `Duracion: ${result.metadata?.durationFormatted || 'desconocida'}`,
        `Resolucion: ${result.metadata?.resolution || 'desconocida'}`,
        `Frames extraidos: ${result.frames?.length || 0}`,
        `---`
      ].join('\n');

      formattedText = `${headerInfo}\n\n${result.text}`;

      // Preparar imagenes (frames) para el resultado
      const images = result.frames.map(frame => ({
        base64: frame.base64,
        mimeType: frame.mimeType,
        pageNumber: frame.frameNumber + 1,
        index: frame.frameNumber,
        timestamp: frame.timestamp,
        timestampFormatted: frame.timestampFormatted,
        ocrText: frame.analysis,  // Usar el analisis visual como "OCR"
        ocrConfidence: 100,  // Vision API tiene alta confianza
        width: null,
        height: null
      }));

      // audioText del video (transcripcion)
      const audioText = result.transcription?.text ? [result.transcription.text] : [];

      // Crear resultado exitoso
      return this.createResult({
        text: formattedText,
        images: [],
        audioText: audioText,
        frames: images,
        processingTime: Date.now() - startTime,
        metadata: {
          format: 'video',
          mimeType: this.getMimeTypeForExtension(path.extname(filePath)),
          fileSize: stats.size,
          duration: result.metadata?.duration,
          durationFormatted: result.metadata?.durationFormatted,
          resolution: result.metadata?.resolution,
          fps: result.metadata?.fps,
          videoCodec: result.metadata?.videoCodec,
          audioCodec: result.metadata?.audioCodec,
          hasAudio: result.metadata?.hasAudio,
          hasVideo: result.metadata?.hasVideo,
          framesExtracted: result.frames?.length || 0,
          transcription: result.transcription ? {
            text: result.transcription.text,
            language: result.transcription.language,
            duration: result.transcription.duration,
            cost: result.transcription.cost
          } : null,
          requiresTranscription: true,
          transcriptionComplete: !!result.transcription
        }
      });
    } catch (error) {
      console.error('[VideoParser] Error procesando video:', error);
      return this.createErrorResult(
        `Error procesando archivo de video: ${error.message}`,
        error
      );
    }
  }

  /**
   * Obtiene los tipos MIME soportados
   * @returns {string[]}
   */
  getSupportedMimeTypes() {
    return this.supportedMimeTypes;
  }

  /**
   * Obtiene las extensiones soportadas
   * @returns {string[]}
   */
  getSupportedExtensions() {
    return this.supportedExtensions;
  }

  /**
   * Obtiene el MIME type basado en la extension
   * @param {string} extension - Extension del archivo
   * @returns {string}
   */
  getMimeTypeForExtension(extension) {
    const mimeMap = {
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.m4v': 'video/x-m4v',
      '.mpeg': 'video/mpeg',
      '.mpg': 'video/mpeg'
    };
    return mimeMap[extension.toLowerCase()] || 'video/octet-stream';
  }
}

module.exports = VideoParser;
