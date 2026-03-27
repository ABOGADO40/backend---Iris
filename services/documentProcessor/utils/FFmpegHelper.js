/**
 * FFmpegHelper - Utilidad para operaciones FFmpeg
 *
 * Wrapper para operaciones comunes de FFmpeg:
 * - Extraccion de audio de video
 * - Extraccion de frames clave
 * - Obtencion de metadata
 * - Division de archivos grandes
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Configurar ruta de FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

class FFmpegHelper {
  constructor(options = {}) {
    this.options = {
      tempDir: options.tempDir || path.join(os.tmpdir(), 'iris-ffmpeg'),
      ...options
    };
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.options.tempDir, { recursive: true });
    } catch (error) {
      console.warn('[FFmpegHelper] No se pudo crear directorio temporal:', error.message);
    }
  }

  /**
   * Verifica si FFmpeg esta instalado y disponible
   * @returns {Promise<{available: boolean, version: string|null, error: string|null}>}
   */
  async checkInstallation() {
    return new Promise((resolve) => {
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          resolve({
            available: false,
            version: null,
            error: err.message
          });
        } else {
          resolve({
            available: true,
            version: ffmpegInstaller.version,
            error: null
          });
        }
      });
    });
  }

  /**
   * Obtiene metadata de un archivo de audio/video
   * @param {string} filePath - Ruta del archivo
   * @returns {Promise<Object>}
   */
  async getMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Error obteniendo metadata: ${err.message}`));
          return;
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');

        resolve({
          format: metadata.format.format_name,
          duration: metadata.format.duration || 0,
          durationFormatted: this.formatDuration(metadata.format.duration || 0),
          size: metadata.format.size || 0,
          bitrate: metadata.format.bit_rate || 0,
          hasAudio: !!audioStream,
          hasVideo: !!videoStream,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
            bitrate: audioStream.bit_rate
          } : null,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate) || 0,
            bitrate: videoStream.bit_rate
          } : null,
          raw: metadata
        });
      });
    });
  }

  /**
   * Obtiene la duracion de un archivo en segundos
   * @param {string} filePath - Ruta del archivo
   * @returns {Promise<number>}
   */
  async getDuration(filePath) {
    const metadata = await this.getMetadata(filePath);
    return metadata.duration;
  }

  /**
   * Extrae el audio de un archivo de video
   * @param {string} videoPath - Ruta del video
   * @param {Object} options - Opciones de extraccion
   * @returns {Promise<{success: boolean, outputPath: string, error?: string}>}
   */
  async extractAudio(videoPath, options = {}) {
    const {
      outputFormat = 'mp3',
      outputPath = null,
      bitrate = '128k',
      channels = 1,
      sampleRate = 16000
    } = options;

    const outputFile = outputPath || path.join(
      this.options.tempDir,
      `audio_${Date.now()}.${outputFormat}`
    );

    return new Promise((resolve) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec(outputFormat === 'mp3' ? 'libmp3lame' : 'aac')
        .audioBitrate(bitrate)
        .audioChannels(channels)
        .audioFrequency(sampleRate)
        .output(outputFile)
        .on('end', () => {
          resolve({
            success: true,
            outputPath: outputFile,
            format: outputFormat
          });
        })
        .on('error', (err) => {
          resolve({
            success: false,
            outputPath: null,
            error: err.message
          });
        })
        .run();
    });
  }

  /**
   * Extrae frames clave de un video
   * @param {string} videoPath - Ruta del video
   * @param {Object} options - Opciones de extraccion
   * @returns {Promise<{success: boolean, frames: Array, error?: string}>}
   */
  async extractKeyframes(videoPath, options = {}) {
    const {
      interval = 30,  // Segundos entre frames
      maxFrames = 10,
      outputFormat = 'jpg',
      width = 1280,
      quality = 2  // 1-31, menor es mejor
    } = options;

    try {
      const metadata = await this.getMetadata(videoPath);
      const duration = metadata.duration;

      if (!duration || duration <= 0) {
        return {
          success: false,
          frames: [],
          error: 'No se pudo determinar la duracion del video'
        };
      }

      // Calcular timestamps para extraer frames
      const timestamps = [];
      let currentTime = 0;
      while (currentTime < duration && timestamps.length < maxFrames) {
        timestamps.push(currentTime);
        currentTime += interval;
      }

      // Si el video es corto, al menos extraer un frame del inicio
      if (timestamps.length === 0) {
        timestamps.push(0);
      }

      const frames = [];
      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];
        const outputFile = path.join(
          this.options.tempDir,
          `frame_${Date.now()}_${i}.${outputFormat}`
        );

        const frameResult = await this.extractFrameAt(videoPath, timestamp, {
          outputPath: outputFile,
          width,
          quality
        });

        if (frameResult.success) {
          // Leer el frame como base64
          const frameData = await fs.readFile(frameResult.outputPath);
          const base64 = frameData.toString('base64');

          frames.push({
            frameNumber: i,
            timestamp: timestamp,
            timestampFormatted: this.formatDuration(timestamp),
            base64: base64,
            mimeType: `image/${outputFormat}`,
            path: frameResult.outputPath
          });
        }
      }

      return {
        success: true,
        frames,
        totalFrames: frames.length,
        duration: metadata.duration,
        interval
      };
    } catch (error) {
      return {
        success: false,
        frames: [],
        error: error.message
      };
    }
  }

  /**
   * Extrae un frame en un timestamp especifico
   * @param {string} videoPath - Ruta del video
   * @param {number} timestamp - Timestamp en segundos
   * @param {Object} options - Opciones
   * @returns {Promise<{success: boolean, outputPath: string, error?: string}>}
   */
  async extractFrameAt(videoPath, timestamp, options = {}) {
    const {
      outputPath = null,
      width = 1280,
      quality = 2
    } = options;

    const outputFile = outputPath || path.join(
      this.options.tempDir,
      `frame_${Date.now()}.jpg`
    );

    return new Promise((resolve) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .size(`${width}x?`)
        .outputOptions([`-qscale:v ${quality}`])
        .output(outputFile)
        .on('end', () => {
          resolve({
            success: true,
            outputPath: outputFile,
            timestamp
          });
        })
        .on('error', (err) => {
          resolve({
            success: false,
            outputPath: null,
            error: err.message
          });
        })
        .run();
    });
  }

  /**
   * Divide un archivo de audio en chunks
   * @param {string} audioPath - Ruta del audio
   * @param {Object} options - Opciones de division
   * @returns {Promise<{success: boolean, chunks: Array, error?: string}>}
   */
  async splitAudio(audioPath, options = {}) {
    const {
      chunkDuration = 600,  // 10 minutos por defecto
      outputFormat = 'mp3',
      overlap = 0  // Segundos de solapamiento
    } = options;

    try {
      const metadata = await this.getMetadata(audioPath);
      const duration = metadata.duration;

      if (!duration || duration <= 0) {
        return {
          success: false,
          chunks: [],
          error: 'No se pudo determinar la duracion del audio'
        };
      }

      // Si el archivo es menor que un chunk, devolverlo como unico chunk
      if (duration <= chunkDuration) {
        return {
          success: true,
          chunks: [{
            index: 0,
            startTime: 0,
            endTime: duration,
            path: audioPath,
            isOriginal: true
          }],
          totalChunks: 1,
          duration
        };
      }

      const chunks = [];
      let startTime = 0;
      let chunkIndex = 0;

      while (startTime < duration) {
        const endTime = Math.min(startTime + chunkDuration, duration);
        const outputFile = path.join(
          this.options.tempDir,
          `chunk_${Date.now()}_${chunkIndex}.${outputFormat}`
        );

        const chunkResult = await this.extractAudioSegment(audioPath, startTime, endTime, {
          outputPath: outputFile,
          format: outputFormat
        });

        if (chunkResult.success) {
          chunks.push({
            index: chunkIndex,
            startTime,
            endTime,
            duration: endTime - startTime,
            path: chunkResult.outputPath,
            isOriginal: false
          });
        }

        startTime = endTime - overlap;
        chunkIndex++;
      }

      return {
        success: true,
        chunks,
        totalChunks: chunks.length,
        duration,
        chunkDuration
      };
    } catch (error) {
      return {
        success: false,
        chunks: [],
        error: error.message
      };
    }
  }

  /**
   * Extrae un segmento de audio
   * @param {string} audioPath - Ruta del audio
   * @param {number} startTime - Tiempo de inicio en segundos
   * @param {number} endTime - Tiempo de fin en segundos
   * @param {Object} options - Opciones
   * @returns {Promise<{success: boolean, outputPath: string, error?: string}>}
   */
  async extractAudioSegment(audioPath, startTime, endTime, options = {}) {
    const {
      outputPath = null,
      format = 'mp3'
    } = options;

    const outputFile = outputPath || path.join(
      this.options.tempDir,
      `segment_${Date.now()}.${format}`
    );

    return new Promise((resolve) => {
      ffmpeg(audioPath)
        .seekInput(startTime)
        .duration(endTime - startTime)
        .audioCodec(format === 'mp3' ? 'libmp3lame' : 'aac')
        .output(outputFile)
        .on('end', () => {
          resolve({
            success: true,
            outputPath: outputFile
          });
        })
        .on('error', (err) => {
          resolve({
            success: false,
            outputPath: null,
            error: err.message
          });
        })
        .run();
    });
  }

  /**
   * Convierte un archivo de audio a formato compatible con Whisper
   * @param {string} audioPath - Ruta del audio
   * @param {Object} options - Opciones
   * @returns {Promise<{success: boolean, outputPath: string, error?: string}>}
   */
  async convertToWhisperFormat(audioPath, options = {}) {
    const {
      outputPath = null,
      sampleRate = 16000,
      channels = 1
    } = options;

    const outputFile = outputPath || path.join(
      this.options.tempDir,
      `whisper_${Date.now()}.mp3`
    );

    return new Promise((resolve) => {
      ffmpeg(audioPath)
        .audioCodec('libmp3lame')
        .audioFrequency(sampleRate)
        .audioChannels(channels)
        .audioBitrate('64k')
        .output(outputFile)
        .on('end', () => {
          resolve({
            success: true,
            outputPath: outputFile
          });
        })
        .on('error', (err) => {
          resolve({
            success: false,
            outputPath: null,
            error: err.message
          });
        })
        .run();
    });
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
   * Limpia archivos temporales
   * @param {string[]} filePaths - Rutas de archivos a limpiar
   */
  async cleanup(filePaths = []) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignorar errores de limpieza
      }
    }
  }

  /**
   * Limpia todos los archivos temporales del directorio temp
   */
  async cleanupTempDir() {
    try {
      const files = await fs.readdir(this.options.tempDir);
      for (const file of files) {
        const filePath = path.join(this.options.tempDir, file);
        await fs.unlink(filePath);
      }
    } catch (error) {
      // Ignorar errores
    }
  }
}

// Exportar instancia singleton
const ffmpegHelper = new FFmpegHelper();

module.exports = {
  FFmpegHelper,
  ffmpegHelper
};
