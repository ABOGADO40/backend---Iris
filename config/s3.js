// =====================================================
// SISTEMA IRIS - S3 Client Configuration (Wasabi)
// =====================================================

const { S3Client } = require('@aws-sdk/client-s3');

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'https://s3.us-east-1.wasabisys.com';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_BUCKET_UPLOADS = process.env.S3_BUCKET_UPLOADS || 'iris-peritajes-uploads';
const S3_BUCKET_BACKUPS = process.env.S3_BUCKET_BACKUPS || 'iris-peritajes-backups';

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;

  if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error('[S3] Faltan credenciales: S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY son requeridas');
  }

  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Requerido para Wasabi
  });

  return s3Client;
}

module.exports = {
  getS3Client,
  S3_BUCKET_UPLOADS,
  S3_BUCKET_BACKUPS,
  S3_REGION,
  S3_ENDPOINT,
};
