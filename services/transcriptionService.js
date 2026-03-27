/**
 * TranscriptionService - Servicio de Transcripcion de Audio
 *
 * Utiliza OpenAI Whisper API para transcribir archivos de audio.
 * Soporta:
 * - Transcripcion de archivos de audio
 * - Division automatica de archivos grandes (>25MB)
 * - Estimacion de costos
 * - Soporte para timestamps
 * - Pre-conversion de formatos no oficiales a MP3
 * - Reintentos con backoff exponencial
 * - Timeout dinamico segun tamano de archivo
 */

const fs = require('fs').promises;
const path = require('path');
const { ffmpegHelper } = require('./documentProcessor/utils/FFmpegHelper');
const aiConfigModel = require('../models/aiConfigModel');

// Limite de Whisper API: 25MB
const WHISPER_MAX_FILE_SIZE = 25 * 1024 * 1024;
// Costo por minuto de Whisper ($0.006/min)
const WHISPER_COST_PER_MINUTE = 0.006;
// Duracion maxima de chunk (10 minutos)
const MAX_CHUNK_DURATION = 600;

// URL de la API de Whisper
const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

// Formatos nativos de Whisper (no requieren conversion)
// Ref: https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create/
const WHISPER_NATIVE_FORMATS = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'];

// Mapa de MIME types por extension de audio
const AUDIO_MIME_MAP = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.webm': 'audio/webm'
};

// Configuracion de timeout (milisegundos)
const TIMEOUT_CONFIG = {
  smallFileMs: 120_000,    // < 10MB: 2 minutos
  largeFileMs: 180_000,    // 10-25MB: 3 minutos
  thresholdBytes: 10 * 1024 * 1024  // 10MB
};

// Configuracion de reintentos
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 2_000,
  retryableStatuses: [429, 500, 502, 503]
};

class TranscriptionService {
  constructor(options = {}) {
    this.options = {
      model: 'whisper-1',
      language: null,  // Auto-detectar
      responseFormat: 'verbose_json',  // Para obtener timestamps
      ...options
    };
  }

  /**
   * Obtiene la configuracion del servicio IA desde la BD
   * @param {string} serviceType - Tipo de servicio (TRANSLATE, RECOMMEND, COMPARE, OBJECTIONS)
   * @returns {Promise<Object|null>}
   */
  async getConfig(serviceType) {
    try {
      return await aiConfigModel.getConfigByServiceType(serviceType);
    } catch (error) {
      console.error(`[TranscriptionService] Error obteniendo config de ${serviceType}:`, error.message);
      return null;
    }
  }

  /**
   * Transcribe un archivo de audio
   * @param {string} filePath - Ruta del archivo de audio
   * @param {Object} options - Opciones de transcripcion
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeAudio(filePath, options = {}) {
    const startTime = Date.now();
    const {
      language = this.options.language,
      withTimestamps = true,
      prompt = null,  // Prompt opcional para contexto
      serviceType     // Tipo de servicio que origina la peticion
    } = options;

    if (!serviceType) {
      return this.createErrorResult('serviceType es requerido para transcripcion de audio');
    }

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);
      const stats = await fs.stat(filePath);

      // Obtener configuracion del servicio que origina la peticion
      const config = await this.getConfig(serviceType);
      if (!config || !config.apiKey) {
        return this.createErrorResult(`Servicio ${serviceType} no configurado o sin API key para transcripcion`);
      }

      if (!config.isActive) {
        return this.createErrorResult(`El servicio ${serviceType} esta desactivado`);
      }

      // Obtener duracion del audio
      const duration = await this.getAudioDuration(filePath);
      const estimatedCost = this.estimateCost(duration / 60);

      console.log(`[TranscriptionService] Procesando archivo: ${path.basename(filePath)}`);
      console.log(`[TranscriptionService] Duracion: ${this.formatDuration(duration)}, Costo estimado: $${estimatedCost.toFixed(4)}`);

      let transcription;

      // Si el archivo es mayor a 25MB, dividir en chunks
      if (stats.size > WHISPER_MAX_FILE_SIZE) {
        console.log(`[TranscriptionService] Archivo grande (${(stats.size / 1024 / 1024).toFixed(2)}MB), dividiendo en chunks...`);
        transcription = await this.transcribeChunked(filePath, config.apiKey, {
          language,
          withTimestamps,
          prompt
        });
      } else {
        // Transcribir directamente
        transcription = await this.callWhisperWithRetry(filePath, config.apiKey, {
          language,
          withTimestamps,
          prompt
        });
      }

      if (!transcription.success) {
        return transcription;
      }

      return {
        success: true,
        text: transcription.text,
        language: transcription.language || language || 'auto',
        duration: duration,
        durationFormatted: this.formatDuration(duration),
        hasTimestamps: withTimestamps && !!transcription.segments,
        timestamps: transcription.segments || [],
        model: config.aiModel || 'whisper-1',
        cost: estimatedCost,
        processingTime: Date.now() - startTime,
        metadata: {
          fileSize: stats.size,
          chunksProcessed: transcription.chunksProcessed || 1
        }
      };
    } catch (error) {
      console.error('[TranscriptionService] Error en transcripcion:', error);
      return this.createErrorResult(error.message);
    }
  }

  /**
   * Transcribe un archivo dividido en chunks
   * @param {string} filePath - Ruta del archivo
   * @param {string} apiKey - API key de OpenAI
   * @param {Object} options - Opciones
   * @returns {Promise<Object>}
   */
  async transcribeChunked(filePath, apiKey, options = {}) {
    const { language, withTimestamps, prompt } = options;
    const tempFiles = [];

    try {
      // Dividir el audio en chunks de 10 minutos
      const splitResult = await ffmpegHelper.splitAudio(filePath, {
        chunkDuration: MAX_CHUNK_DURATION,
        outputFormat: 'mp3'
      });

      if (!splitResult.success) {
        return this.createErrorResult(`Error dividiendo audio: ${splitResult.error}`);
      }

      console.log(`[TranscriptionService] Audio dividido en ${splitResult.chunks.length} chunks`);

      const transcriptions = [];
      let cumulativeOffset = 0;

      // Procesar chunks en serie (para mantener orden y no exceder rate limits)
      for (let i = 0; i < splitResult.chunks.length; i++) {
        const chunk = splitResult.chunks[i];
        console.log(`[TranscriptionService] Procesando chunk ${i + 1}/${splitResult.chunks.length}`);

        const chunkPath = chunk.path;
        if (!chunk.isOriginal) {
          tempFiles.push(chunkPath);
        }

        const chunkResult = await this.callWhisperWithRetry(chunkPath, apiKey, {
          language,
          withTimestamps,
          prompt: i === 0 ? prompt : null  // Solo usar prompt en el primer chunk
        });

        if (!chunkResult.success) {
          // Limpiar archivos temporales
          await ffmpegHelper.cleanup(tempFiles);
          return chunkResult;
        }

        // Ajustar timestamps con el offset acumulado
        if (chunkResult.segments && chunkResult.segments.length > 0) {
          const adjustedSegments = chunkResult.segments.map(seg => ({
            ...seg,
            start: seg.start + cumulativeOffset,
            end: seg.end + cumulativeOffset
          }));
          transcriptions.push({
            text: chunkResult.text,
            segments: adjustedSegments
          });
        } else {
          transcriptions.push({
            text: chunkResult.text,
            segments: []
          });
        }

        cumulativeOffset += chunk.duration || MAX_CHUNK_DURATION;
      }

      // Limpiar archivos temporales
      await ffmpegHelper.cleanup(tempFiles);

      // Combinar transcripciones
      const combinedText = transcriptions.map(t => t.text).join(' ');
      const combinedSegments = transcriptions.flatMap(t => t.segments);

      return {
        success: true,
        text: combinedText,
        language: language,
        segments: combinedSegments,
        chunksProcessed: splitResult.chunks.length
      };
    } catch (error) {
      await ffmpegHelper.cleanup(tempFiles);
      return this.createErrorResult(error.message);
    }
  }

  /**
   * Llama a la API de Whisper para transcribir un archivo.
   * Pre-convierte formatos no oficiales a MP3, usa MIME type dinamico,
   * modelo configurable, y timeout con AbortController.
   * @param {string} filePath - Ruta del archivo
   * @param {string} apiKey - API key de OpenAI
   * @param {Object} options - Opciones
   * @returns {Promise<Object>}
   */
  async callWhisperAPI(filePath, apiKey, options = {}) {
    const { language, withTimestamps, prompt } = options;
    let tempConvertedFile = null;

    try {
      let actualFilePath = filePath;

      // Pre-convertir formatos no oficiales a MP3
      // COMENTADO: Whisper soporta nativamente todos los formatos del sistema
      // (mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac)
      // Se mantiene el codigo por si se necesita reactivar para formatos futuros
      const ext = path.extname(filePath).toLowerCase();
      console.log(`[TranscriptionService] Enviando formato ${ext} directo a Whisper (sin conversion)`);
      // if (!WHISPER_NATIVE_FORMATS.includes(ext)) {
      //   console.log(`[TranscriptionService] Formato ${ext} no es nativo de Whisper, convirtiendo a MP3...`);
      //   console.log(`[TranscriptionService] Archivo original: ${filePath} (${ext})`);
      //   const convertStart = Date.now();
      //   const converted = await ffmpegHelper.convertToWhisperFormat(filePath);
      //   const convertMs = Date.now() - convertStart;
      //   if (converted.success) {
      //     const convertedStats = await fs.stat(converted.outputPath);
      //     actualFilePath = converted.outputPath;
      //     tempConvertedFile = converted.outputPath;
      //     console.log(`[TranscriptionService] Conversion ${ext} -> .mp3 exitosa en ${convertMs}ms`);
      //     console.log(`[TranscriptionService] Archivo convertido: ${converted.outputPath} (${(convertedStats.size / 1024).toFixed(1)}KB)`);
      //   } else {
      //     console.warn(`[TranscriptionService] Conversion ${ext} -> .mp3 FALLIDA en ${convertMs}ms: ${converted.error}`);
      //     console.warn(`[TranscriptionService] Intentando con formato original ${ext} (Whisper podria rechazarlo)`);
      //   }
      // } else {
      //   console.log(`[TranscriptionService] Formato ${ext} es nativo de Whisper, sin conversion necesaria`);
      // }

      // Leer el archivo (original o convertido)
      const fileBuffer = await fs.readFile(actualFilePath);
      const fileName = path.basename(actualFilePath);

      // Resolver MIME type dinamicamente
      const actualExt = path.extname(actualFilePath).toLowerCase();
      const mimeType = AUDIO_MIME_MAP[actualExt] || 'application/octet-stream';
      console.log(`[TranscriptionService] Enviando a Whisper: ${fileName} (${actualExt}, ${mimeType}, ${(fileBuffer.length / 1024).toFixed(1)}KB)`);

      // Construir multipart body
      const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
      const parts = [];

      // Parte del archivo
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      ));
      parts.push(fileBuffer);
      parts.push(Buffer.from('\r\n'));

      // Parte del modelo (dinamico desde config)
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.options.model}\r\n`
      ));

      // Parte del response_format
      const responseFormat = withTimestamps ? 'verbose_json' : 'json';
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\n${responseFormat}\r\n`
      ));

      // Idioma (opcional)
      if (language) {
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`
        ));
      }

      // Prompt de contexto (opcional)
      if (prompt) {
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`
        ));
      }

      // Cierre del boundary
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      const bodyBuffer = Buffer.concat(parts);

      // Timeout dinamico segun tamano del archivo
      const timeoutMs = fileBuffer.length > TIMEOUT_CONFIG.thresholdBytes
        ? TIMEOUT_CONFIG.largeFileMs
        : TIMEOUT_CONFIG.smallFileMs;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await fetch(WHISPER_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          },
          body: bodyBuffer,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Error de Whisper API: ${response.status}`;
        const isRetryable = RETRY_CONFIG.retryableStatuses.includes(response.status);
        return {
          success: false,
          text: '',
          error: errorMessage,
          retryable: isRetryable,
          statusCode: response.status
        };
      }

      const data = await response.json();

      return {
        success: true,
        text: data.text || '',
        language: data.language,
        segments: data.segments || [],
        duration: data.duration,
        retryable: false
      };
    } catch (error) {
      const isTimeout = error.name === 'AbortError';
      return {
        success: false,
        text: '',
        error: isTimeout
          ? `Timeout de Whisper API (el archivo tardo demasiado en procesarse)`
          : error.message,
        retryable: isTimeout || error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED',
        statusCode: null
      };
    } finally {
      // Limpiar archivo convertido temporal
      if (tempConvertedFile) {
        await fs.unlink(tempConvertedFile).catch(() => {});
      }
    }
  }

  /**
   * Wrapper de callWhisperAPI con reintentos y backoff exponencial.
   * Solo reintenta en errores recuperables (429, 500, 502, 503, timeout, red).
   * @param {string} filePath - Ruta del archivo
   * @param {string} apiKey - API key de OpenAI
   * @param {Object} options - Opciones
   * @returns {Promise<Object>}
   */
  async callWhisperWithRetry(filePath, apiKey, options = {}) {
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      const result = await this.callWhisperAPI(filePath, apiKey, options);

      if (result.success) return result;

      // No reintentar si el error no es recuperable o es el ultimo intento
      if (!result.retryable || attempt === RETRY_CONFIG.maxRetries) {
        if (attempt > 1) {
          console.warn(`[TranscriptionService] Fallaron los ${attempt} intentos para: ${path.basename(filePath)}`);
        }
        return result;
      }

      const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`[TranscriptionService] Intento ${attempt}/${RETRY_CONFIG.maxRetries} fallo (${result.error}). Reintentando en ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Obtiene la duracion de un archivo de audio en segundos
   * @param {string} filePath - Ruta del archivo
   * @returns {Promise<number>}
   */
  async getAudioDuration(filePath) {
    try {
      return await ffmpegHelper.getDuration(filePath);
    } catch (error) {
      console.warn('[TranscriptionService] No se pudo obtener duracion:', error.message);
      return 0;
    }
  }

  /**
   * Estima el costo de transcripcion basado en la duracion
   * @param {number} minutes - Duracion en minutos
   * @returns {number} Costo estimado en USD
   */
  estimateCost(minutes) {
    return minutes * WHISPER_COST_PER_MINUTE;
  }

  /**
   * Formatea duracion en segundos a formato legible
   * @param {number} seconds - Duracion en segundos
   * @returns {string}
   */
  formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Crea un resultado de error estandar
   * @param {string} message - Mensaje de error
   * @returns {TranscriptionResult}
   */
  createErrorResult(message) {
    return {
      success: false,
      text: '',
      language: null,
      duration: 0,
      hasTimestamps: false,
      timestamps: [],
      error: message
    };
  }
}

/**
 * @typedef {Object} TranscriptionResult
 * @property {boolean} success - Si la transcripcion fue exitosa
 * @property {string} text - Texto transcrito
 * @property {string} language - Idioma detectado/usado
 * @property {number} duration - Duracion del audio en segundos
 * @property {string} durationFormatted - Duracion formateada
 * @property {boolean} hasTimestamps - Si incluye timestamps
 * @property {Array} timestamps - Segmentos con timestamps
 * @property {string} model - Modelo usado
 * @property {number} cost - Costo estimado en USD
 * @property {number} processingTime - Tiempo de procesamiento en ms
 * @property {Object} metadata - Metadata adicional
 * @property {string} [error] - Mensaje de error si fallo
 */

// Exportar instancia singleton
const transcriptionService = new TranscriptionService();

module.exports = {
  TranscriptionService,
  transcriptionService,
  WHISPER_MAX_FILE_SIZE,
  WHISPER_COST_PER_MINUTE
};
