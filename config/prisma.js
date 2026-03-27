// =====================================================
// SISTEMA IRIS - Prisma Client Configuration
// Singleton pattern para conexion a base de datos
// =====================================================
//
// CONFIGURACIÓN HÍBRIDA (LOCAL / RAILWAY):
//
// - DESARROLLO LOCAL (NODE_ENV=development):
//   Conecta a PostgreSQL local → localhost:5432/iris_peritajes
//   Usa la DATABASE_URL definida en backend/.env
//   Logs detallados: queries, errores, warnings
//
// - PRODUCCIÓN / RAILWAY (NODE_ENV=production):
//   Conecta a PostgreSQL de Railway (tramway.proxy.rlwy.net)
//   Usa la DATABASE_URL configurada en el dashboard de Railway
//   Logs reducidos: solo errores y warnings
//
// ⚠️  Las bases de datos LOCAL y RAILWAY son INDEPENDIENTES.
//     Los cambios en una NO afectan a la otra.
// =====================================================

const { PrismaClient } = require('@prisma/client');

const isProduction = process.env.NODE_ENV === 'production';

// Singleton para evitar multiples conexiones en desarrollo
let prisma;

if (isProduction) {
  // PRODUCCIÓN (Railway): Conexión nueva, logs mínimos
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  // DESARROLLO LOCAL: Reutilizar conexión (singleton), logs detallados
  // Esto evita que nodemon cree conexiones nuevas en cada reinicio
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
