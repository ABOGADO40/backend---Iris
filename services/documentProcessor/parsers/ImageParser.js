/**
 * ImageParser - Parser para imagenes con OCR
 *
 * Utiliza tesseract.js para OCR y sharp para procesamiento de imagenes
 */

const BaseParser = require('./BaseParser');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class ImageParser extends BaseParser {
  constructor(options = {}) {
    super({
      language: 'spa+eng', // Espanol + Ingles por defecto
      ocrPSM: 3, // Automatic page segmentation
      preprocessImage: true,
      maxImageSize: 4096, // Max dimension en pixels
      ...options
    });
    this.supportedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/webp'
    ];
    this.supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'];
    this.worker = null;
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

      // Obtener metadata de la imagen
      const imageMetadata = await this.getImageMetadata(filePath);

      // Preprocesar imagen si esta habilitado
      let processedImagePath = filePath;
      if (mergedOptions.preprocessImage) {
        processedImagePath = await this.preprocessImage(filePath, mergedOptions);
      }

      // Realizar OCR
      const ocrResult = await this.performOCR(processedImagePath, mergedOptions);

      // Limpiar archivo temporal si se creo
      if (processedImagePath !== filePath) {
        try {
          await fs.unlink(processedImagePath);
        } catch (cleanupError) {
          console.warn('No se pudo limpiar archivo temporal:', cleanupError.message);
        }
      }

      // Leer imagen como base64 para enviar a Vision API si es necesario
      const imageBuffer = await fs.readFile(filePath);
      const base64 = imageBuffer.toString('base64');
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = this.getMimeType(ext);

      const processingTime = Date.now() - startTime;

      return this.createResult({
        text: ocrResult.text,
        images: [{
          base64,
          mimeType,
          pageNumber: 1,
          index: 0,
          ocrText: ocrResult.text,
          ocrConfidence: ocrResult.confidence,
          width: imageMetadata.width,
          height: imageMetadata.height
        }],
        processingTime,
        pageCount: 1,
        metadata: {
          format: imageMetadata.format,
          width: imageMetadata.width,
          height: imageMetadata.height,
          channels: imageMetadata.channels,
          hasAlpha: imageMetadata.hasAlpha,
          space: imageMetadata.space,
          ocrConfidence: ocrResult.confidence,
          ocrLanguage: mergedOptions.language,
          wordsDetected: ocrResult.words?.length || 0,
          fileSize: imageBuffer.length
        }
      });
    } catch (error) {
      return this.createErrorResult(`Error procesando imagen: ${error.message}`, error);
    }
  }

  /**
   * Obtiene metadatos de la imagen usando sharp
   */
  async getImageMetadata(filePath) {
    try {
      const metadata = await sharp(filePath).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        space: metadata.space,
        density: metadata.density
      };
    } catch (error) {
      console.warn('Error obteniendo metadata de imagen:', error.message);
      return {
        width: null,
        height: null,
        format: 'unknown'
      };
    }
  }

  /**
   * Preprocesa la imagen para mejorar resultados de OCR
   */
  async preprocessImage(filePath, options) {
    try {
      const tempPath = filePath.replace(/(\.[^.]+)$/, '_preprocessed$1');

      await sharp(filePath)
        // Redimensionar si es muy grande
        .resize(options.maxImageSize, options.maxImageSize, {
          fit: 'inside',
          withoutEnlargement: true
        })
        // Convertir a escala de grises para mejor OCR
        .grayscale()
        // Aumentar contraste
        .normalize()
        // Aplicar un ligero sharpening
        .sharpen()
        // Guardar como PNG para mejor calidad
        .png()
        .toFile(tempPath);

      return tempPath;
    } catch (error) {
      console.warn('Error preprocesando imagen, usando original:', error.message);
      return filePath;
    }
  }

  /**
   * Realiza OCR usando Tesseract.js
   */
  async performOCR(imagePath, options) {
    try {
      const result = await Tesseract.recognize(imagePath, options.language, {
        logger: () => {} // Silenciar logs
      });

      return {
        text: result.data.text?.trim() || '',
        confidence: result.data.confidence || 0,
        words: result.data.words || [],
        lines: result.data.lines || []
      };
    } catch (error) {
      console.error('Error en OCR:', error.message);
      return {
        text: '',
        confidence: 0,
        words: [],
        lines: []
      };
    }
  }

  /**
   * Obtiene el tipo MIME basado en la extension
   */
  getMimeType(extension) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.webp': 'image/webp'
    };
    return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
  }

  /**
   * Convierte una imagen a base64 con opciones de compresion
   */
  async imageToBase64(filePath, options = {}) {
    const { maxWidth = 2048, maxHeight = 2048, quality = 85 } = options;

    try {
      let sharpInstance = sharp(filePath);
      const metadata = await sharpInstance.metadata();

      // Redimensionar si es necesario
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Convertir a JPEG para menor tamano
      const buffer = await sharpInstance
        .jpeg({ quality })
        .toBuffer();

      return {
        base64: buffer.toString('base64'),
        mimeType: 'image/jpeg',
        width: Math.min(metadata.width, maxWidth),
        height: Math.min(metadata.height, maxHeight)
      };
    } catch (error) {
      // Fallback: leer archivo directamente
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();

      return {
        base64: buffer.toString('base64'),
        mimeType: this.getMimeType(ext),
        width: null,
        height: null
      };
    }
  }
}

module.exports = ImageParser;
