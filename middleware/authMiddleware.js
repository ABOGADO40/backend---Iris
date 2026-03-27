// =====================================================
// SISTEMA IRIS - Middleware de Autenticacion
// Fecha: 2026-01-19
// =====================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authModel = require('../models/authModel');
const { ERROR_MESSAGES } = require('../utils/constants');

/**
 * Middleware para verificar token JWT
 * Adjunta req.user, req.token y req.tokenHash al request
 */
async function verifyToken(req, res, next) {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    // Verificar y decodificar token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expirado. Por favor inicie sesion nuevamente.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        code: 'INVALID_TOKEN',
      });
    }

    // Verificar que la sesion no este revocada
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const isValid = await authModel.isSessionValid(tokenHash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Sesion invalidada. Por favor inicie sesion nuevamente.',
        code: 'SESSION_REVOKED',
      });
    }

    // Obtener usuario actualizado con permisos
    const user = await authModel.findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.USER_INACTIVE,
        code: 'USER_INACTIVE',
      });
    }

    // Extraer permisos del usuario
    const permissions = authModel.extractPermissions(user);

    // Adjuntar usuario y permisos al request
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions,
    };
    req.token = token;
    req.tokenHash = tokenHash;

    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error en verifyToken:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

/**
 * Factory de middleware para verificar permiso especifico
 * @param {string} permissionCode - Codigo del permiso requerido
 * @returns {Function} - Middleware de Express
 */
function checkPermission(permissionCode) {
  return (req, res, next) => {
    // Verificar que el usuario esta autenticado
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        code: 'NOT_AUTHENTICATED',
      });
    }

    // Super admin tiene todos los permisos
    if (req.user.roleName === 'SUPER_ADMIN') {
      return next();
    }

    // Verificar si tiene el permiso especifico
    if (!req.user.permissions.includes(permissionCode)) {
      return res.status(403).json({
        success: false,
        error: ERROR_MESSAGES.FORBIDDEN,
        code: 'PERMISSION_DENIED',
        requiredPermission: permissionCode,
      });
    }

    next();
  };
}

/**
 * Middleware para verificar multiples permisos (requiere al menos uno)
 * @param {string[]} permissionCodes - Array de codigos de permisos
 * @returns {Function} - Middleware de Express
 */
function checkAnyPermission(permissionCodes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        code: 'NOT_AUTHENTICATED',
      });
    }

    // Super admin tiene todos los permisos
    if (req.user.roleName === 'SUPER_ADMIN') {
      return next();
    }

    // Verificar si tiene al menos uno de los permisos
    const hasPermission = permissionCodes.some(code =>
      req.user.permissions.includes(code)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: ERROR_MESSAGES.FORBIDDEN,
        code: 'PERMISSION_DENIED',
        requiredPermissions: permissionCodes,
      });
    }

    next();
  };
}

/**
 * Middleware para verificar que el usuario es SUPER_ADMIN
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: ERROR_MESSAGES.UNAUTHORIZED,
      code: 'NOT_AUTHENTICATED',
    });
  }

  if (req.user.roleName !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Se requiere rol SUPER_ADMIN.',
      code: 'FORBIDDEN',
    });
  }

  next();
}

/**
 * Middleware para verificar roles especificos
 * @param {string|string[]} allowedRoles - Rol(es) permitido(s)
 * @returns {Function} - Middleware de Express
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        code: 'NOT_AUTHENTICATED',
      });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.roleName)) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. Rol no autorizado.',
        code: 'FORBIDDEN',
      });
    }

    next();
  };
}

/**
 * Middleware para verificar que el usuario es propietario del recurso o admin
 * @param {Function} getOwnerId - Funcion async que recibe req y retorna el ownerId del recurso
 * @returns {Function} - Middleware de Express
 */
function checkOwnership(getOwnerId) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.UNAUTHORIZED,
        code: 'NOT_AUTHENTICATED',
      });
    }

    // Super admin tiene acceso a todo
    if (req.user.roleName === 'SUPER_ADMIN') {
      return next();
    }

    try {
      const ownerId = await getOwnerId(req);

      if (ownerId === null) {
        return res.status(404).json({
          success: false,
          error: ERROR_MESSAGES.NOT_FOUND,
        });
      }

      if (ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: ERROR_MESSAGES.FORBIDDEN,
          code: 'NOT_OWNER',
        });
      }

      next();
    } catch (error) {
      console.error('[AuthMiddleware] Error en checkOwnership:', error.message);
      return res.status(500).json({
        success: false,
        error: ERROR_MESSAGES.INTERNAL_ERROR,
      });
    }
  };
}

module.exports = {
  verifyToken,
  checkPermission,
  checkAnyPermission,
  checkOwnership,
  requireSuperAdmin,
  requireRole,
};
