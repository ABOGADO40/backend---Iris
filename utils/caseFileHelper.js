// =====================================================
// SISTEMA IRIS - Case File Helper
// Utilidades para manejo de archivos de casos
// Soporta S3 (Wasabi) y disco local
// =====================================================

const fs = require('fs');
const path = require('path');
const storageService = require('../services/storageService');

const UPLOAD_BASE_DIR = storageService.UPLOAD_BASE_DIR;
const CASES_DIR = path.join(UPLOAD_BASE_DIR, 'casos');
const TEMP_CASES_DIR = path.join(UPLOAD_BASE_DIR, 'temp_cases');

// Crear directorios base al cargar el modulo
[CASES_DIR, TEMP_CASES_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Asegura que existe la carpeta de un caso (para almacenamiento local)
 */
function ensureCaseDir(caseId) {
  const dir = path.join(CASES_DIR, String(caseId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Mueve archivo temporal a S3 o carpeta del caso (para descripcion)
 * @returns {Promise<string>} storagePath (s3://... o ruta relativa local)
 */
async function moveCaseFile(tempPath, caseId, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  const destFilename = `description${ext}`;

  if (storageService.useS3()) {
    const s3Key = `casos/${caseId}/${destFilename}`;
    const mimeType = getMimeType(ext);
    const storagePath = await storageService.upload(tempPath, s3Key, { contentType: mimeType });
    // Eliminar archivo temporal local
    try { fs.unlinkSync(tempPath); } catch (e) { /* ignorar */ }
    return storagePath;
  }

  // Fallback local
  const caseDir = ensureCaseDir(caseId);
  const destPath = path.join(caseDir, destFilename);

  // Si ya existe un archivo de descripcion anterior, eliminarlo
  const existingFiles = fs.readdirSync(caseDir).filter((f) => f.startsWith('description.'));
  existingFiles.forEach((f) => {
    try { fs.unlinkSync(path.join(caseDir, f)); } catch (e) { /* ignorar */ }
  });

  fs.renameSync(tempPath, destPath);
  return path.join('casos', String(caseId), destFilename).replace(/\\/g, '/');
}

/**
 * Mueve archivo temporal a S3 o carpeta del caso (para evidencia creada desde IA)
 * @returns {Promise<string>} storagePath (s3://... o ruta relativa local)
 */
async function saveEvidenceFile(tempPath, caseId, evidenceId, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  const destFilename = `${evidenceId}${ext}`;

  if (storageService.useS3()) {
    const s3Key = `casos/${caseId}/${destFilename}`;
    const mimeType = getMimeType(ext);
    const storagePath = await storageService.upload(tempPath, s3Key, { contentType: mimeType });
    // Eliminar archivo temporal local
    try { fs.unlinkSync(tempPath); } catch (e) { /* ignorar */ }
    return storagePath;
  }

  // Fallback local
  const caseDir = ensureCaseDir(caseId);
  const destPath = path.join(caseDir, destFilename);
  fs.renameSync(tempPath, destPath);
  return path.join('casos', String(caseId), destFilename).replace(/\\/g, '/');
}

/**
 * Elimina un archivo (S3 o local)
 * @returns {Promise<boolean>}
 */
async function deleteCaseFile(filePath) {
  if (!filePath) return false;
  return storageService.deleteFile(filePath);
}

/**
 * Obtiene la ruta absoluta de un archivo local
 * Para archivos S3, retorna null (usar getLocalPathForReading en su lugar)
 * Backward-compatible: corrige storagePaths que incluyen 'app/uploads/'
 */
function getAbsolutePath(relativePath) {
  if (!relativePath) return null;
  if (storageService.isS3Path(relativePath)) return null;
  return storageService.resolveLocalPath(relativePath);
}

/**
 * Obtiene un archivo para lectura local (descarga de S3 si es necesario)
 * Para el pipeline de procesamiento (OCR, PDF parse, etc.)
 * @param {string} storagePath - s3://... o ruta relativa local
 * @returns {Promise<string|null>} Ruta absoluta local del archivo
 */
async function getLocalPathForReading(storagePath) {
  if (!storagePath) return null;

  if (storageService.isS3Path(storagePath)) {
    try {
      return await storageService.downloadToLocal(storagePath);
    } catch (error) {
      console.error('[CaseFileHelper] Error descargando de S3:', error.message);
      return null;
    }
  }

  // Local
  const localPath = storageService.resolveLocalPath(storagePath);
  if (localPath && fs.existsSync(localPath)) return localPath;
  return null;
}

/**
 * Helper para deducir MIME type de extension
 */
function getMimeType(ext) {
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  ensureCaseDir,
  moveCaseFile,
  saveEvidenceFile,
  deleteCaseFile,
  getAbsolutePath,
  getLocalPathForReading,
  CASES_DIR,
  TEMP_CASES_DIR,
  UPLOAD_BASE_DIR,
};
