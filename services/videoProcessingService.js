/**
 * VideoProcessingService - Servicio de Procesamiento de Video
 *
 * Procesa archivos de video extrayendo:
 * - Audio para transcripcion
 * - Frames clave para analisis visual
 * - Metadata del video
 */

const path = require('path');
const fs = require('fs').promises;
const { ffmpegHelper, FFmpegHelper } = require('./documentProcessor/utils/FFmpegHelper');
const { transcriptionService } = require('./transcriptionService');
const aiConfigModel = require('../models/aiConfigModel');
const { VISION_MODEL } = require('./analysis/shared/constants');

class VideoProcessingService {
  constructor(options = {}) {
    this.options = {
      frameInterval: 30,  // Segundos entre frames
      maxFrames: 10,      // Maximo de frames a extraer
      frameWidth: 1280,   // Ancho de frames
      analyzeFrames: true, // Analizar frames con Vision API
      ...options
    };
  }

  /**
   * Procesa un archivo de video completo
   * @param {string} videoPath - Ruta del video
   * @param {Object} options - Opciones de procesamiento
   * @returns {Promise<VideoProcessResult>}
   */
  async processVideo(videoPath, options = {}) {
    const startTime = Date.now();
    const mergedOptions = { ...this.options, ...options };
    const tempFiles = [];

    try {
      // Verificar que el archivo existe
      await fs.access(videoPath);

      // Obtener metadata del video
      console.log(`[VideoProcessingService] Obteniendo metadata de: ${path.basename(videoPath)}`);
      const metadata = await this.getVideoMetadata(videoPath);

      if (!metadata.hasVideo && !metadata.hasAudio) {
        return this.createErrorResult('El archivo no contiene streams de video ni audio');
      }

      let transcription = null;
      let frames = [];

      // Extraer y transcribir audio si existe
      if (metadata.hasAudio) {
        console.log('[VideoProcessingService] Extrayendo audio del video...');
        const audioResult = await this.extractAudio(videoPath);

        if (audioResult.success) {
          tempFiles.push(audioResult.outputPath);
          console.log('[VideoProcessingService] Transcribiendo audio...');
          transcription = await transcriptionService.transcribeAudio(audioResult.outputPath, {
            language: options.language,
            serviceType: mergedOptions.serviceType
          });
        } else {
          console.warn('[VideoProcessingService] No se pudo extraer audio:', audioResult.error);
        }
      }

      // Extraer frames clave si el video tiene stream de video
      if (metadata.hasVideo) {
        console.log('[VideoProcessingService] Extrayendo frames clave...');
        const framesResult = await this.extractKeyframes(videoPath, {
          interval: mergedOptions.frameInterval,
          maxFrames: mergedOptions.maxFrames,
          width: mergedOptions.frameWidth
        });

        if (framesResult.success) {
          frames = framesResult.frames;
          // Agregar archivos temporales de frames para limpieza
          framesResult.frames.forEach(f => {
            if (f.path) tempFiles.push(f.path);
          });

          // Analizar frames con Vision API si esta habilitado
          if (mergedOptions.analyzeFrames && frames.length > 0) {
            console.log('[VideoProcessingService] Analizando frames con Vision API...');
            frames = await this.analyzeFramesWithVision(frames, mergedOptions.serviceType);
          }
        }
      }

      // Limpiar archivos temporales
      await ffmpegHelper.cleanup(tempFiles);

      // Combinar contenido para texto final
      let combinedText = '';

      if (transcription?.success && transcription.text) {
        combinedText += '=== TRANSCRIPCION DEL AUDIO ===\n\n';
        combinedText += transcription.text;
        combinedText += '\n\n';
      }

      if (frames.length > 0) {
        combinedText += '=== DESCRIPCION VISUAL (FRAMES) ===\n\n';
        frames.forEach((frame, i) => {
          combinedText += `[${frame.timestampFormatted || '00:00'}] `;
          combinedText += frame.analysis || 'Frame sin analisis';
          combinedText += '\n\n';
        });
      }

      return {
        success: true,
        text: combinedText.trim(),
        transcription: transcription?.success ? {
          text: transcription.text,
          language: transcription.language,
          duration: transcription.duration,
          durationFormatted: transcription.durationFormatted,
          hasTimestamps: transcription.hasTimestamps,
          timestamps: transcription.timestamps,
          cost: transcription.cost
        } : null,
        frames: frames.map(f => ({
          frameNumber: f.frameNumber,
          timestamp: f.timestamp,
          timestampFormatted: f.timestampFormatted,
          base64: f.base64,
          mimeType: f.mimeType,
          analysis: f.analysis
        })),
        metadata: {
          duration: metadata.duration,
          durationFormatted: metadata.durationFormatted,
          hasAudio: metadata.hasAudio,
          hasVideo: metadata.hasVideo,
          resolution: metadata.video ? `${metadata.video.width}x${metadata.video.height}` : null,
          fps: metadata.video?.fps,
          videoCodec: metadata.video?.codec,
          audioCodec: metadata.audio?.codec,
          processingTime: Date.now() - startTime
        },
        error: null
      };
    } catch (error) {
      await ffmpegHelper.cleanup(tempFiles);
      console.error('[VideoProcessingService] Error procesando video:', error);
      return this.createErrorResult(error.message);
    }
  }

  /**
   * Extrae el audio de un video
   * @param {string} videoPath - Ruta del video
   * @param {Object} options - Opciones
   * @returns {Promise<{success: boolean, outputPath: string, error?: string}>}
   */
  async extractAudio(videoPath, options = {}) {
    return ffmpegHelper.extractAudio(videoPath, {
      outputFormat: 'mp3',
      bitrate: '128k',
      channels: 1,
      sampleRate: 16000,
      ...options
    });
  }

  /**
   * Extrae frames clave de un video
   * @param {string} videoPath - Ruta del video
   * @param {Object} options - Opciones
   * @returns {Promise<{success: boolean, frames: Array, error?: string}>}
   */
  async extractKeyframes(videoPath, options = {}) {
    return ffmpegHelper.extractKeyframes(videoPath, {
      interval: options.interval || this.options.frameInterval,
      maxFrames: options.maxFrames || this.options.maxFrames,
      width: options.width || this.options.frameWidth,
      quality: 2
    });
  }

  /**
   * Obtiene metadata de un video
   * @param {string} videoPath - Ruta del video
   * @returns {Promise<Object>}
   */
  async getVideoMetadata(videoPath) {
    return ffmpegHelper.getMetadata(videoPath);
  }

  /**
   * Analiza frames con OpenAI Vision API
   * @param {Array} frames - Array de frames con base64
   * @param {string} serviceType - Tipo de servicio que origina la peticion
   * @returns {Promise<Array>}
   */
  async analyzeFramesWithVision(frames, serviceType) {
    try {
      const config = await aiConfigModel.getConfigByServiceType(serviceType);

      if (!config || !config.apiKey || !config.isActive) {
        console.warn(`[VideoProcessingService] Vision API no disponible para ${serviceType}, omitiendo analisis de frames`);
        return frames.map(f => ({ ...f, analysis: null }));
      }

      const analyzedFrames = [];

      // Analizar frames en serie para no exceder rate limits
      for (const frame of frames) {
        try {
          const analysis = await this.analyzeFrameWithVision(frame, config.apiKey, config.aiModel);
          analyzedFrames.push({
            ...frame,
            analysis: analysis
          });
        } catch (error) {
          console.warn(`[VideoProcessingService] Error analizando frame ${frame.frameNumber}:`, error.message);
          analyzedFrames.push({
            ...frame,
            analysis: null
          });
        }

        // Pequena pausa entre llamadas para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return analyzedFrames;
    } catch (error) {
      console.error('[VideoProcessingService] Error en analisis de frames:', error);
      return frames.map(f => ({ ...f, analysis: null }));
    }
  }

  /**
   * Analiza un frame individual con Vision API
   * @param {Object} frame - Frame con base64 y metadata
   * @param {string} apiKey - API key de OpenAI
   * @returns {Promise<string>}
   */
  async analyzeFrameWithVision(frame, apiKey, model) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || VISION_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Eres un analista forense visual. Describe brevemente lo que ves en esta imagen de video. Enfocate en: personas, objetos, texto visible, acciones y contexto. Responde en espanol y se conciso (2-3 oraciones).'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Describe este frame del video (timestamp: ${frame.timestampFormatted || 'desconocido'}):`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${frame.mimeType};base64,${frame.base64}`,
                  detail: 'low'  // Usar low para reducir costos
                }
              }
            ]
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Error de Vision API: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Sin descripcion disponible';
  }

  /**
   * Crea un resultado de error estandar
   * @param {string} message - Mensaje de error
   * @returns {VideoProcessResult}
   */
  createErrorResult(message) {
    return {
      success: false,
      text: '',
      transcription: null,
      frames: [],
      metadata: null,
      error: message
    };
  }
}

/**
 * @typedef {Object} VideoProcessResult
 * @property {boolean} success - Si el procesamiento fue exitoso
 * @property {string} text - Texto combinado (transcripcion + descripciones visuales)
 * @property {Object|null} transcription - Resultado de transcripcion del audio
 * @property {Array} frames - Frames extraidos con analisis
 * @property {Object|null} metadata - Metadata del video
 * @property {string|null} error - Mensaje de error si fallo
 */

// Exportar instancia singleton
const videoProcessingService = new VideoProcessingService();

module.exports = {
  VideoProcessingService,
  videoProcessingService
};
