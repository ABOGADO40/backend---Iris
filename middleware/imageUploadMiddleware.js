/**
 * File Upload Middleware
 *
 * Middleware unificado para subida de archivos en servicios IA
 * Utiliza Multer con almacenamiento en disco temporal
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const TEMP_DIR = path.join(__dirname, '../uploads/temp_images');
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_FILES = 10;

// Asegurar que existe el directorio temporal
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Configuracion de almacenamiento de Multer
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `analysis_${uniqueId}${ext}`;
    cb(null, filename);
  }
});

/**
 * Filtro unificado para archivos de analisis IA (acepta todos los tipos soportados)
 */
const unifiedFileFilter = (req, file, cb) => {
  const allowedExtensions = [
    // Documentos
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.pptx', '.txt', '.csv', '.json', '.xml',
    // Imagenes
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp',
    // Audio
    '.mp3', '.wav', '.m4a', '.ogg', '.opus', '.flac', '.aac',
    // Video
    '.mp4', '.avi', '.mkv', '.mov', '.webm', '.wmv'
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${ext}`), false);
  }
};

/**
 * Instancia de Multer unificada para servicios IA
 * Acepta cualquier archivo soportado por documentProcessor
 */
const uploadAnalysisFiles = multer({
  storage,
  fileFilter: unifiedFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES
  }
});

/**
 * Middleware para limpiar archivos temporales despues de procesar
 */
const cleanupTempImages = async (req, res, next) => {
  const originalEnd = res.end;

  res.end = function (...args) {
    if (req.files) {
      setImmediate(() => {
        const files = Array.isArray(req.files)
          ? req.files
          : Object.values(req.files).flat();
        files.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err && err.code !== 'ENOENT') {
              console.warn(`No se pudo eliminar archivo temporal ${file.path}:`, err.message);
            }
          });
        });
      });
    }

    return originalEnd.apply(this, args);
  };

  next();
};

/**
 * Manejador de errores de Multer
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message;
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `El archivo excede el tamano maximo permitido (${MAX_FILE_SIZE / 1024 / 1024}MB)`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = `Se excedio el numero maximo de archivos (${MAX_FILES})`;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = `Campo de archivo inesperado: ${err.field}`;
        break;
      default:
        message = `Error al subir archivo: ${err.message}`;
    }

    return res.status(400).json({
      error: message,
      code: err.code
    });
  } else if (err) {
    return res.status(400).json({
      error: err.message || 'Error al procesar archivo'
    });
  }

  next();
};

/**
 * Limpia archivos temporales antiguos
 */
const cleanupOldTempFiles = async (maxAgeMs = 3600000) => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (err) {
        // Ignorar errores individuales
      }
    }

    if (cleaned > 0) {
      console.log(`[ImageUpload] Limpiados ${cleaned} archivos temporales antiguos`);
    }

    return cleaned;
  } catch (error) {
    console.error('[ImageUpload] Error limpiando archivos temporales:', error.message);
    return 0;
  }
};

// Limpiar archivos antiguos al cargar el modulo
cleanupOldTempFiles();

// Programar limpieza periodica (cada hora)
setInterval(() => {
  cleanupOldTempFiles();
}, 3600000);

module.exports = {
  uploadAnalysisFiles,
  cleanupTempImages,
  handleMulterError
};
