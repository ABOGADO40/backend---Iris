// =====================================================
// SISTEMA IRIS - Wasabi S3 Setup Script
// Crea buckets, configura CORS y políticas
// Ejecutar: node scripts/setup-wasabi.js
// =====================================================

const {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketVersioningCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

// ─────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────
const CONFIG = {
  endpoint: 'https://s3.us-east-1.wasabisys.com',
  region: 'us-east-1',
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  bucketUploads: process.env.S3_BUCKET_UPLOADS || 'iris-peritajes-uploads',
  bucketBackups: process.env.S3_BUCKET_BACKUPS || 'iris-peritajes-backups',
};

const s3 = new S3Client({
  endpoint: CONFIG.endpoint,
  region: CONFIG.region,
  credentials: {
    accessKeyId: CONFIG.accessKeyId,
    secretAccessKey: CONFIG.secretAccessKey,
  },
  forcePathStyle: true,
});

// ─────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────

async function bucketExists(bucketName) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // 403 = exists but no access, treat as exists
    if (err.$metadata?.httpStatusCode === 403) {
      return true;
    }
    throw err;
  }
}

async function createBucket(bucketName) {
  const exists = await bucketExists(bucketName);
  if (exists) {
    console.log(`   [existe] Bucket "${bucketName}" ya existe`);
    return false;
  }

  await s3.send(new CreateBucketCommand({
    Bucket: bucketName,
  }));
  console.log(`   [creado] Bucket "${bucketName}" creado exitosamente`);
  return true;
}

// ─────────────────────────────────────────────────────
// CONFIGURACIÓN DE CORS (solo para uploads)
// ─────────────────────────────────────────────────────

async function configureCORS(bucketName) {
  const corsConfig = {
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [
            'https://iris-frontend-production-89be.up.railway.app',
            'http://localhost:5173',
            'http://localhost:3000',
          ],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: [
            'ETag',
            'Content-Length',
            'Content-Type',
            'x-amz-request-id',
          ],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  };

  await s3.send(new PutBucketCorsCommand(corsConfig));
  console.log(`   [CORS] Configurado para "${bucketName}"`);
}

// ─────────────────────────────────────────────────────
// VERSIONADO (solo para backups)
// ─────────────────────────────────────────────────────

async function enableVersioning(bucketName) {
  await s3.send(new PutBucketVersioningCommand({
    Bucket: bucketName,
    VersioningConfiguration: {
      Status: 'Enabled',
    },
  }));
  console.log(`   [versionado] Habilitado para "${bucketName}"`);
}

// ─────────────────────────────────────────────────────
// LIFECYCLE (limpieza de archivos temporales en uploads)
// ─────────────────────────────────────────────────────

async function configureLifecycle(bucketName) {
  await s3.send(new PutBucketLifecycleConfigurationCommand({
    Bucket: bucketName,
    LifecycleConfiguration: {
      Rules: [
        {
          ID: 'cleanup-temp-files',
          Status: 'Enabled',
          Filter: {
            Prefix: 'temp/',
          },
          Expiration: {
            Days: 1,
          },
        },
        {
          ID: 'cleanup-incomplete-multipart',
          Status: 'Enabled',
          Filter: {
            Prefix: '',
          },
          AbortIncompleteMultipartUpload: {
            DaysAfterInitiation: 1,
          },
        },
      ],
    },
  }));
  console.log(`   [lifecycle] Configurado para "${bucketName}"`);
}

// ─────────────────────────────────────────────────────
// CREAR ESTRUCTURA DE CARPETAS
// ─────────────────────────────────────────────────────

async function createFolderStructure(bucketName, folders) {
  for (const folder of folders) {
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: `${folder}/.keep`,
      Body: '',
      ContentType: 'application/x-empty',
    }));
  }
  console.log(`   [estructura] Carpetas creadas: ${folders.join(', ')}`);
}

// ─────────────────────────────────────────────────────
// VERIFICACIÓN FINAL
// ─────────────────────────────────────────────────────

async function verifySetup() {
  console.log('\n[Verificacion] Listando buckets...');
  const { Buckets } = await s3.send(new ListBucketsCommand({}));
  const irisBuckets = Buckets.filter(b =>
    b.Name === CONFIG.bucketUploads || b.Name === CONFIG.bucketBackups
  );

  for (const bucket of irisBuckets) {
    console.log(`   [OK] ${bucket.Name} (creado: ${bucket.CreationDate.toISOString()})`);
  }

  // Test de escritura/lectura en uploads
  console.log('\n[Test] Probando escritura en uploads...');
  const testKey = 'test/connectivity-test.txt';
  await s3.send(new PutObjectCommand({
    Bucket: CONFIG.bucketUploads,
    Key: testKey,
    Body: `IRIS Connectivity Test - ${new Date().toISOString()}`,
    ContentType: 'text/plain',
  }));
  console.log('   [OK] Escritura exitosa');

  // Test de escritura en backups
  console.log('[Test] Probando escritura en backups...');
  await s3.send(new PutObjectCommand({
    Bucket: CONFIG.bucketBackups,
    Key: testKey,
    Body: `IRIS Backup Connectivity Test - ${new Date().toISOString()}`,
    ContentType: 'text/plain',
  }));
  console.log('   [OK] Escritura exitosa');
}

// ─────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('   SISTEMA IRIS - Wasabi S3 Setup');
  console.log('═'.repeat(60));
  console.log(`\n  Endpoint: ${CONFIG.endpoint}`);
  console.log(`  Region:   ${CONFIG.region}`);
  console.log(`  Uploads:  ${CONFIG.bucketUploads}`);
  console.log(`  Backups:  ${CONFIG.bucketBackups}\n`);

  // 1. Crear buckets
  console.log('[1/5] Creando buckets...');
  await createBucket(CONFIG.bucketUploads);
  await createBucket(CONFIG.bucketBackups);

  // 2. Configurar CORS en uploads
  console.log('\n[2/5] Configurando CORS en uploads...');
  await configureCORS(CONFIG.bucketUploads);

  // 3. Habilitar versionado en backups
  console.log('\n[3/5] Habilitando versionado en backups...');
  await enableVersioning(CONFIG.bucketBackups);

  // 4. Configurar lifecycle en uploads
  console.log('\n[4/5] Configurando lifecycle en uploads...');
  await configureLifecycle(CONFIG.bucketUploads);

  // 5. Crear estructura de carpetas
  console.log('\n[5/5] Creando estructura de carpetas...');
  await createFolderStructure(CONFIG.bucketUploads, [
    'evidences',
    'evidences/files',
    'evidences/texts',
    'cases',
    'cases/description-files',
    'exports',
    'exports/pdf',
    'exports/docx',
    'exports/pptx',
    'temp',
  ]);
  await createFolderStructure(CONFIG.bucketBackups, [
    'database',
    'config',
  ]);

  // Verificar
  await verifySetup();

  console.log('\n' + '═'.repeat(60));
  console.log('   SETUP COMPLETADO EXITOSAMENTE');
  console.log('═'.repeat(60));
  console.log(`
┌──────────────────────────────────────────────────────────┐
│  BUCKETS CONFIGURADOS                                    │
├──────────────────────────────────────────────────────────┤
│  Uploads: ${CONFIG.bucketUploads.padEnd(45)}│
│    - CORS habilitado (frontend Railway + localhost)      │
│    - Lifecycle: temp/ se limpia a las 24h                │
│    - Multipart incompleto: se elimina a las 24h          │
│    - Carpetas: evidences/, cases/, exports/, temp/       │
├──────────────────────────────────────────────────────────┤
│  Backups: ${CONFIG.bucketBackups.padEnd(45)}│
│    - Versionado habilitado                               │
│    - Carpetas: database/, config/                        │
└──────────────────────────────────────────────────────────┘
`);
}

main().catch(err => {
  console.error('\n[ERROR]', err.message);
  if (err.Code) console.error('  Code:', err.Code);
  process.exit(1);
});
