/**
 * AudioParser - Parser para archivos de audio
 *
 * Transcribe archivos de audio usando OpenAI Whisper API.
 * Soporta formatos: .mp3, .wav, .m4a, .ogg, .opus, .flac, .aac, .wma, .webm
 */

const path = require('path');
const fs = require('fs').promises;
const BaseParser = require('./BaseParser');
const { transcriptionService } = require('../../transcriptionService');

class AudioParser extends BaseParser {
  constructor(options = {}) {
    super(options);

    this.supportedExtensions = [
      '.mp3',
      '.wav',
      '.m4a',
      '.ogg',
      '.opus',
      '.flac',
      '.aac',
      '.wma',
      '.webm'
    ];

    this.supportedMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'audio/ogg',
      'audio/opus',
      'audio/flac',
      'audio/x-flac',
      'audio/aac',
      'audio/x-aac',
      'audio/x-ms-wma',
      'audio/webm'
    ];
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
   * Procesa el archivo de audio y lo transcribe
   * @param {string} filePath - Ruta del archivo
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<ParseResult>}
   */
  async parse(filePath, options = {}) {
    const startTime = Date.now();
    const {
      language = null,
      withTimestamps = true
    } = options;

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);
      const stats = await fs.stat(filePath);

      console.log(`[AudioParser] Procesando archivo de audio: ${path.basename(filePath)}`);

      // Transcribir el audio usando la API key del servicio que origina la peticion
      const transcription = await transcriptionService.transcribeAudio(filePath, {
        language,
        withTimestamps,
        serviceType: options.serviceType
      });

      if (!transcription.success) {
        return this.createErrorResult(
          `Error en transcripcion: ${transcription.error}`,
          new Error(transcription.error)
        );
      }

      // Formatear el texto con metadata
      let formattedText = transcription.text;

      // Agregar informacion del archivo al inicio
      const headerInfo = [
        `[TRANSCRIPCION DE AUDIO]`,
        `Archivo: ${path.basename(filePath)}`,
        `Duracion: ${transcription.durationFormatted}`,
        `Idioma: ${transcription.language || 'auto-detectado'}`,
        `---`
      ].join('\n');

      formattedText = `${headerInfo}\n\n${formattedText}`;

      // Crear resultado exitoso
      return this.createResult({
        text: formattedText,
        images: [],
        audioText: [transcription.text],
        frames: [],
        processingTime: Date.now() - startTime,
        metadata: {
          format: 'audio',
          mimeType: this.getMimeTypeForExtension(path.extname(filePath)),
          fileSize: stats.size,
          duration: transcription.duration,
          durationFormatted: transcription.durationFormatted,
          language: transcription.language,
          hasTimestamps: transcription.hasTimestamps,
          timestamps: transcription.timestamps,
          model: transcription.model,
          cost: transcription.cost,
          requiresTranscription: true,
          transcriptionComplete: true
        }
      });
    } catch (error) {
      console.error('[AudioParser] Error procesando audio:', error);
      return this.createErrorResult(
        `Error procesando archivo de audio: ${error.message}`,
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
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/m4a',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.wma': 'audio/x-ms-wma',
      '.webm': 'audio/webm'
    };
    return mimeMap[extension.toLowerCase()] || 'audio/octet-stream';
  }

  /**
   * Estima el costo de transcripcion para un archivo
   * @param {number} durationSeconds - Duracion en segundos
   * @returns {number} Costo estimado en USD
   */
  estimateCost(durationSeconds) {
    return transcriptionService.estimateCost(durationSeconds / 60);
  }
}

module.exports = AudioParser;
