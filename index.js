// =====================================================
// SISTEMA IRIS - Punto de Entrada Principal
// =====================================================
// CONFIGURACIÓN HÍBRIDA: Este archivo funciona tanto en
// DESARROLLO LOCAL como en PRODUCCIÓN (Railway).
//
// - LOCAL: Lee variables de .env (localhost:5432/iris_peritajes)
// - RAILWAY: Lee variables del entorno de Railway (automáticas)
//
// El entorno se detecta automáticamente por NODE_ENV:
//   - "development" → Desarrollo LOCAL
//   - "production"  → Railway (Producción)
// =====================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar middleware de autenticacion
const { verifyToken } = require('./middleware/authMiddleware');

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const caseRoutes = require('./routes/caseRoutes');
const evidenceRoutes = require('./routes/evidenceRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const tagRoutes = require('./routes/tagRoutes');
const exportRoutes = require('./routes/exportRoutes');
const auditRoutes = require('./routes/auditRoutes');
const userRoutes = require('./routes/userRoutes');
const aiConfigRoutes = require('./routes/aiConfigRoutes');

// =====================================================
// DETECCIÓN DE ENTORNO (LOCAL vs RAILWAY)
// =====================================================
const isProduction = process.env.NODE_ENV === 'production';
const isLocal = !isProduction;

// =====================================================
// CONFIGURACION DE RUTAS PUBLICAS (WHITELIST)
// =====================================================

const PUBLIC_ROUTES = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/verify-pin' },
  { method: 'POST', path: '/api/auth/resend-pin' },
];

/**
 * Verifica si una ruta es publica
 * @param {string} method - Metodo HTTP
 * @param {string} path - Path de la ruta
 * @returns {boolean}
 */
function isPublicRoute(method, path) {
  return PUBLIC_ROUTES.some(route =>
    route.method === method && path === route.path
  );
}

/**
 * Middleware global de autenticacion
 * Intercepta TODAS las rutas /api/* excepto las publicas
 */
async function globalAuthGuard(req, res, next) {
  // Si no es una ruta de API, continuar
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // Si es una ruta publica, continuar sin autenticacion
  if (isPublicRoute(req.method, req.path)) {
    return next();
  }

  // Para todas las demas rutas, verificar token
  return verifyToken(req, res, next);
}

// Crear aplicacion Express
const app = express();

// =====================================================
// CONFIGURACION DE MIDDLEWARES
// =====================================================

// CORS - Permitir solicitudes desde el frontend
// LOCAL: http://localhost:5173 | RAILWAY: URL del frontend desplegado
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

// Body parser para JSON
app.use(express.json({ limit: '50mb' }));

// Body parser para URL encoded
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estaticos de uploads (solo si almacenamiento es local)
if (process.env.STORAGE_PROVIDER !== 's3') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// =====================================================
// MIDDLEWARE GLOBAL DE AUTENTICACION
// Debe estar ANTES de las rutas de API
// =====================================================
app.use(globalAuthGuard);

// =====================================================
// REGISTRO DE RUTAS API
// =====================================================

// Ruta de health check
// Incluye información del entorno para identificar LOCAL vs RAILWAY
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Sistema IRIS API funcionando correctamente',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    // En desarrollo local, incluir info adicional para depuración
    ...(isLocal && {
      mode: 'DESARROLLO LOCAL',
      database: process.env.DATABASE_URL?.split('/').pop() || 'unknown',
    }),
  });
});

// Rutas de autenticacion
app.use('/api/auth', authRoutes);

// Rutas de casos
app.use('/api/cases', caseRoutes);

// Rutas de evidencias
app.use('/api/evidences', evidenceRoutes);

// Rutas de analisis
app.use('/api/analysis', analysisRoutes);

// Rutas de consumo de tokens
const usageRoutes = require('./routes/usageRoutes');
app.use('/api/usage', usageRoutes);

// Rutas de tags
app.use('/api/tags', tagRoutes);

// Rutas de exportaciones
app.use('/api/exports', exportRoutes);

// Rutas de auditoria
app.use('/api/audit', auditRoutes);

// Rutas de usuarios
app.use('/api/users', userRoutes);

// Rutas de configuracion de IA (Solo SUPER_ADMIN)
app.use('/api/ai-config', aiConfigRoutes);

// =====================================================
// MANEJO DE ERRORES
// =====================================================

// Ruta no encontrada (404)
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('[Error Global]', err);

  // Error de JSON malformado
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'JSON malformado en el body de la solicitud.',
      code: 'INVALID_JSON',
    });
  }

  // Error de Prisma
  if (err.code && err.code.startsWith('P')) {
    console.error('[Prisma Error]', err.code, err.message);
    return res.status(500).json({
      success: false,
      error: 'Error en la base de datos.',
      code: 'DATABASE_ERROR',
    });
  }

  // Error generico
  // En LOCAL muestra detalles del error; en RAILWAY muestra mensaje genérico
  return res.status(err.status || 500).json({
    success: false,
    error: isProduction
      ? 'Error interno del servidor.'
      : err.message,
    code: 'INTERNAL_ERROR',
    ...(isLocal && { stack: err.stack }),
  });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('');
  console.log('=====================================================');
  if (isLocal) {
    // Banner para DESARROLLO LOCAL
    console.log('    SISTEMA IRIS - Backend API [DESARROLLO LOCAL]');
    console.log('=====================================================');
    console.log(`  Entorno:      DESARROLLO LOCAL`);
    console.log(`  Puerto:       ${PORT}`);
    const dbUrl = process.env.DATABASE_URL || '';
    const dbHost = dbUrl.match(/@([^:\/]+)/)?.[1] || 'localhost';
    const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'unknown';
    console.log(`  Base de datos: ${dbHost}/${dbName}`);
    console.log(`  Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.log(`  Storage:      ${process.env.STORAGE_PROVIDER === 's3' ? 'Wasabi S3 (' + (process.env.S3_BUCKET_UPLOADS || 'iris-peritajes-uploads') + ')' : 'Disco Local (uploads/)'}`);
    console.log(`  Health check: http://localhost:${PORT}/api/health`);
    console.log('-----------------------------------------------------');
    console.log('  Este servidor es LOCAL. NO afecta Railway.');
    console.log(`  La BD conectada es ${dbName} en tu máquina.`);
  } else {
    // Banner para PRODUCCIÓN (Railway)
    console.log('      SISTEMA IRIS - Backend API [PRODUCCION]');
    console.log('=====================================================');
    console.log(`  Entorno:      PRODUCCION (Railway)`);
    console.log(`  Puerto:       ${PORT}`);
    console.log(`  Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`  Storage:      ${process.env.STORAGE_PROVIDER === 's3' ? 'Wasabi S3 (' + (process.env.S3_BUCKET_UPLOADS || 'iris-peritajes-uploads') + ')' : 'Disco Local (uploads/)'}`);
    console.log(`  Health check: /api/health`);
  }
  console.log('=====================================================');
  console.log('');
});

module.exports = app;
