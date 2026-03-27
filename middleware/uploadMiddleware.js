// =====================================================
// SISTEMA IRIS - Upload Middleware
// Configuracion de Multer para upload de archivos
// =====================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Directorio base para uploads
const UPLOAD_BASE_DIR = path.join(__dirname, '..', 'uploads');
const DOCUMENTS_DIR = path.join(UPLOAD_BASE_DIR, 'documents');
const TEMP_CASES_DIR = path.join(UPLOAD_BASE_DIR, 'temp_cases');

// Crear directorios si no existen
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Asegurar que los directorios existan al cargar el modulo
ensureDirectoryExists(DOCUMENTS_DIR);
ensureDirectoryExists(TEMP_CASES_DIR);

/**
 * Configuracion de almacenamiento para documentos
 * Genera nombres unicos con UUID manteniendo la extension original
 */
const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Crear subdirectorio por ano/mes para organizacion
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const subDir = path.join(DOCUMENTS_DIR, String(year), month);

    ensureDirectoryExists(subDir);
    cb(null, subDir);
  },
  filename: function (req, file, cb) {
    // Generar nombre unico con UUID
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${uniqueId}${ext}`;
    cb(null, filename);
  },
});

/**
 * Filtro de archivos
 * Permite la mayoria de tipos de archivo para peritajes
 */
const documentFileFilter = function (req, file, cb) {
  // Lista de extensiones permitidas (muy amplia para peritajes)
  const allowedExtensions = [
    // Documentos
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.rtf', '.txt', '.csv',
    // Imagenes
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.svg',
    '.heic', '.heif',
    // Audio
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma',
    '.opus', '.amr',
    // Video
    '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v',
    '.3gp', '.mts', '.m2ts', '.ts', '.mpg', '.mpeg',
    // Otros formatos comunes
    '.json', '.xml', '.html', '.htm', '.eml', '.msg',
  ];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${ext}. Extensiones permitidas: ${allowedExtensions.join(', ')}`), false);
  }
};

/**
 * Middleware de upload para documentos
 * Configurado para soportar archivos hasta 2GB
 */
const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB en bytes
    files: 1, // Un archivo a la vez
  },
});

/**
 * Middleware de manejo de errores de Multer
 * Debe usarse despues del upload
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    // Errores especificos de Multer
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({
          success: false,
          message: 'El archivo excede el tamano maximo permitido (2GB)',
          error: 'FILE_TOO_LARGE',
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Solo se permite subir un archivo a la vez',
          error: 'TOO_MANY_FILES',
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Campo de archivo inesperado',
          error: 'UNEXPECTED_FIELD',
        });
      default:
        return res.status(400).json({
          success: false,
          message: `Error en la carga del archivo: ${err.message}`,
          error: 'UPLOAD_ERROR',
        });
    }
  } else if (err) {
    // Otros errores (ej: tipo de archivo no permitido)
    return res.status(400).json({
      success: false,
      message: err.message || 'Error al procesar el archivo',
      error: 'FILE_PROCESSING_ERROR',
    });
  }
  next();
}

/**
 * Elimina un archivo del sistema de archivos
 * @param {string} filePath - Ruta del archivo a eliminar
 */
function deleteFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        // Si el archivo no existe, no es error critico
        if (err.code === 'ENOENT') {
          resolve(false);
        } else {
          reject(err);
        }
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Obtiene informacion de un archivo
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<Object|null>} - Stats del archivo o null
 */
function getFileInfo(filePath) {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        resolve(null);
      } else {
        resolve({
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          isFile: stats.isFile(),
        });
      }
    });
  });
}

/**
 * Storage temporal para documentos de descripcion de caso
 */
const caseDocumentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureDirectoryExists(TEMP_CASES_DIR);
    cb(null, TEMP_CASES_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueId}${ext}`);
  },
});

/**
 * Filtro para documentos de descripcion de caso
 * Solo PDF, Word y TXT
 */
const caseDocumentFilter = function (req, file, cb) {
  const allowed = ['.pdf', '.doc', '.docx', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido para descripcion: ${ext}. Solo se permiten: ${allowed.join(', ')}`), false);
  }
};

/**
 * Middleware de upload para documento de descripcion de caso
 * Max 50MB, 1 archivo
 */
const uploadCaseDocument = multer({
  storage: caseDocumentStorage,
  fileFilter: caseDocumentFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1,
  },
});

module.exports = {
  uploadDocument,
  uploadCaseDocument,
  handleUploadError,
  deleteFile,
  getFileInfo,
  UPLOAD_BASE_DIR,
  DOCUMENTS_DIR,
};
