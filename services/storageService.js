// =====================================================
// SISTEMA IRIS - Storage Service
// Servicio central de almacenamiento (S3 / Local)
// Auto-detecta por prefijo s3:// si usar S3 o disco
// =====================================================

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getS3Client, S3_BUCKET_UPLOADS } = require('../config/s3');

const UPLOAD_BASE_DIR = path.join(__dirname, '..', 'uploads');
const TEMP_PROCESSING_DIR = path.join(UPLOAD_BASE_DIR, 'temp_processing');

// Asegurar directorio temporal
if (!fs.existsSync(TEMP_PROCESSING_DIR)) {
  fs.mkdirSync(TEMP_PROCESSING_DIR, { recursive: true });
}

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';

// =====================================================
// HELPERS
// =====================================================

/**
 * Detecta si un path es de S3 (prefijo s3://)
 */
function isS3Path(storagePath) {
  return storagePath && storagePath.startsWith('s3://');
}

/**
 * Extrae la key de S3 de un storagePath con prefijo s3://
 */
function getS3Key(storagePath) {
  if (!isS3Path(storagePath)) return null;
  return storagePath.substring(5); // quitar 's3://'
}

/**
 * Resuelve un storagePath local a ruta absoluta
 * Maneja prefijos 'app/uploads/' para evitar duplicacion
 */
function resolveLocalPath(storagePath) {
  if (!storagePath || isS3Path(storagePath)) return null;

  const normalized = storagePath.replace(/\\/g, '/');
  let cleanPath = normalized;

  if (cleanPath.startsWith('app/uploads/')) {
    cleanPath = cleanPath.substring('app/uploads/'.length);
  } else if (cleanPath.startsWith('/app/uploads/')) {
    cleanPath = cleanPath.substring('/app/uploads/'.length);
  }

  return path.join(UPLOAD_BASE_DIR, cleanPath);
}

/**
 * Determina si debemos usar S3 para nuevos uploads
 */
function useS3() {
  return STORAGE_PROVIDER === 's3';
}

// =====================================================
// OPERACIONES DE ALMACENAMIENTO
// =====================================================

/**
 * Sube un archivo local a S3
 * @param {string} localPath - Ruta absoluta del archivo local
 * @param {string} s3Key - Key destino en S3
 * @param {Object} [options] - Opciones (contentType)
 * @returns {string} storagePath con prefijo s3://
 */
async function upload(localPath, s3Key, options = {}) {
  const fileBuffer = fs.readFileSync(localPath);
  const contentType = options.contentType || 'application/octet-stream';

  const client = getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET_UPLOADS,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: contentType,
  }));

  return `s3://${s3Key}`;
}

/**
 * Sube un buffer directo a S3
 * @param {Buffer} buffer - Contenido a subir
 * @param {string} s3Key - Key destino en S3
 * @param {Object} [options] - Opciones (contentType)
 * @returns {string} storagePath con prefijo s3://
 */
async function uploadBuffer(buffer, s3Key, options = {}) {
  const contentType = options.contentType || 'application/octet-stream';

  const client = getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET_UPLOADS,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `s3://${s3Key}`;
}

/**
 * Obtiene un ReadableStream desde S3 o disco local
 * @param {string} storagePath - Path con prefijo s3:// o ruta local
 * @returns {ReadableStream}
 */
async function getStream(storagePath) {
  if (isS3Path(storagePath)) {
    const key = getS3Key(storagePath);
    const client = getS3Client();
    const response = await client.send(new GetObjectCommand({
      Bucket: S3_BUCKET_UPLOADS,
      Key: key,
    }));
    return response.Body;
  }

  // Ruta local
  const localPath = resolveLocalPath(storagePath);
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error(`Archivo local no encontrado: ${storagePath}`);
  }
  return fs.createReadStream(localPath);
}

/**
 * Descarga un archivo de S3 a disco local (para processing pipeline)
 * @param {string} storagePath - Path con prefijo s3:// o ruta local
 * @param {string} [destPath] - Destino local; si no se da, usa temp_processing
 * @returns {string} Ruta absoluta local del archivo descargado
 */
async function downloadToLocal(storagePath, destPath) {
  if (!isS3Path(storagePath)) {
    // Ya es local, resolver y retornar
    const localPath = resolveLocalPath(storagePath);
    if (localPath && fs.existsSync(localPath)) return localPath;
    throw new Error(`Archivo local no encontrado: ${storagePath}`);
  }

  const key = getS3Key(storagePath);
  const fileName = path.basename(key);
  const localDest = destPath || path.join(TEMP_PROCESSING_DIR, `${Date.now()}_${fileName}`);

  // Asegurar directorio destino
  const destDir = path.dirname(localDest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const client = getS3Client();
  const response = await client.send(new GetObjectCommand({
    Bucket: S3_BUCKET_UPLOADS,
    Key: key,
  }));

  // Escribir stream a disco
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(localDest);
    const body = response.Body;

    if (body instanceof Readable || typeof body.pipe === 'function') {
      body.pipe(writeStream);
    } else {
      // Si es un buffer o similar
      writeStream.write(body);
      writeStream.end();
    }

    writeStream.on('finish', () => resolve(localDest));
    writeStream.on('error', reject);
  });
}

/**
 * Elimina un archivo de S3 o disco local
 * @param {string} storagePath - Path con prefijo s3:// o ruta local
 * @returns {boolean} true si se elimino correctamente
 */
async function deleteFile(storagePath) {
  if (!storagePath) return false;

  try {
    if (isS3Path(storagePath)) {
      const key = getS3Key(storagePath);
      const client = getS3Client();
      await client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET_UPLOADS,
        Key: key,
      }));
      return true;
    }

    // Local
    const localPath = resolveLocalPath(storagePath);
    if (localPath && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      return true;
    }
  } catch (error) {
    console.error('[StorageService] Error eliminando archivo:', error.message);
  }

  return false;
}

/**
 * Verifica existencia de un archivo en S3 o disco
 * @param {string} storagePath - Path con prefijo s3:// o ruta local
 * @returns {boolean}
 */
async function exists(storagePath) {
  if (!storagePath) return false;

  try {
    if (isS3Path(storagePath)) {
      const key = getS3Key(storagePath);
      const client = getS3Client();
      await client.send(new HeadObjectCommand({
        Bucket: S3_BUCKET_UPLOADS,
        Key: key,
      }));
      return true;
    }

    // Local
    const localPath = resolveLocalPath(storagePath);
    return localPath ? fs.existsSync(localPath) : false;
  } catch (error) {
    // HeadObject lanza error si no existe
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error('[StorageService] Error verificando existencia:', error.message);
    return false;
  }
}

/**
 * Limpia archivos temporales en temp_processing/ mayores a maxAge
 * @param {number} [maxAgeMs=3600000] - Edad maxima en ms (default: 1h)
 */
function cleanupTempProcessing(maxAgeMs = 3600000) {
  try {
    if (!fs.existsSync(TEMP_PROCESSING_DIR)) return;
    const files = fs.readdirSync(TEMP_PROCESSING_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(TEMP_PROCESSING_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      } catch (e) { /* ignorar */ }
    }
  } catch (error) {
    console.error('[StorageService] Error limpiando temp_processing:', error.message);
  }
}

// Limpiar temp_processing cada 30 minutos
setInterval(() => cleanupTempProcessing(), 30 * 60 * 1000);

module.exports = {
  // Operaciones
  upload,
  uploadBuffer,
  getStream,
  downloadToLocal,
  deleteFile,
  exists,
  cleanupTempProcessing,
  // Helpers
  isS3Path,
  getS3Key,
  resolveLocalPath,
  useS3,
  // Constantes
  UPLOAD_BASE_DIR,
  TEMP_PROCESSING_DIR,
  STORAGE_PROVIDER,
};
