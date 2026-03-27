// =====================================================
// SISTEMA IRIS - Modelo de Autenticacion
// Fecha: 2026-01-19
// =====================================================

const prisma = require('../config/prisma');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

/**
 * Busca un usuario por email incluyendo rol y permisos
 * @param {string} email - Email del usuario
 * @returns {Promise<object|null>} - Usuario con rol y permisos o null
 */
async function findUserByEmail(email) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      role: {
        include: {
          rolesPermissions: {
            where: { isActive: true },
            include: {
              permission: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  type: true,
                  resource: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return user;
}

/**
 * Busca un usuario por ID incluyendo rol y permisos
 * @param {number} id - ID del usuario
 * @returns {Promise<object|null>} - Usuario con rol y permisos o null
 */
async function findUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      role: {
        include: {
          rolesPermissions: {
            where: { isActive: true },
            include: {
              permission: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  type: true,
                  resource: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return user;
}

/**
 * Crea un nuevo usuario
 * @param {object} data - Datos del usuario
 * @param {string} data.email - Email del usuario
 * @param {string} data.password - Password en texto plano
 * @param {string} data.fullName - Nombre completo
 * @param {number} data.roleId - ID del rol
 * @param {number} [data.userIdRegistration] - ID del usuario que registra
 * @returns {Promise<object>} - Usuario creado
 */
async function createUser(data) {
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      passwordHash,
      fullName: data.fullName,
      roleId: data.roleId,
      isActive: true,
      userIdRegistration: data.userIdRegistration || null,
    },
    include: {
      role: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  });

  return user;
}

/**
 * Verifica si la password proporcionada coincide con el hash
 * @param {string} password - Password en texto plano
 * @param {string} passwordHash - Hash almacenado
 * @returns {Promise<boolean>} - True si coincide
 */
async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Crea una sesion para el usuario
 * @param {number} userId - ID del usuario
 * @param {string} tokenHash - Hash del token JWT
 * @param {Date} expiresAt - Fecha de expiracion
 * @param {string} ipAddress - IP del cliente
 * @param {string} userAgent - User-Agent del cliente
 * @returns {Promise<object>} - Sesion creada
 */
async function createSession(userId, tokenHash, expiresAt, ipAddress, userAgent) {
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress,
      userAgent,
      userIdRegistration: userId,
    },
  });

  return session;
}

/**
 * Revoca una sesion (logout)
 * @param {string} tokenHash - Hash del token a revocar
 * @param {number} userId - ID del usuario
 * @returns {Promise<object|null>} - Sesion actualizada o null
 */
async function revokeSession(tokenHash, userId) {
  const session = await prisma.session.updateMany({
    where: {
      tokenHash,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      userIdModification: userId,
      dateTimeModification: new Date(),
    },
  });

  return session;
}

/**
 * Verifica si una sesion es valida (no revocada y no expirada)
 * @param {string} tokenHash - Hash del token
 * @returns {Promise<boolean>} - True si la sesion es valida
 */
async function isSessionValid(tokenHash) {
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  return session !== null;
}

/**
 * Obtiene el rol por defecto para nuevos usuarios
 * @returns {Promise<object|null>} - Rol USER o null
 */
async function getDefaultRole() {
  const role = await prisma.role.findUnique({
    where: { name: 'USER' },
  });

  return role;
}

/**
 * Extrae los permisos de un usuario en formato de array de codigos
 * @param {object} user - Usuario con rol y permisos cargados
 * @returns {string[]} - Array de codigos de permisos
 */
function extractPermissions(user) {
  if (!user?.role?.rolesPermissions) {
    return [];
  }

  return user.role.rolesPermissions
    .filter(rp => rp.permission?.isActive !== false)
    .map(rp => rp.permission.code);
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  verifyPassword,
  createSession,
  revokeSession,
  isSessionValid,
  getDefaultRole,
  extractPermissions,
};
