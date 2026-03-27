// =====================================================
// SISTEMA IRIS - Controlador de Autenticacion
// Fecha: 2026-01-19
// =====================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authModel = require('../models/authModel');
const auditService = require('../services/auditService');
const emailVerificationModel = require('../models/emailVerificationModel');
const emailService = require('../services/emailService');
const emailTemplates = require('../services/emailTemplates');
const { AUDIT_ACTIONS, ENTITY_TYPES, ERROR_MESSAGES } = require('../utils/constants');

/**
 * Login de usuario
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email y password son requeridos.',
        code: 'MISSING_FIELDS',
      });
    }

    // Buscar usuario por email
    const user = await authModel.findUserByEmail(email);

    if (!user) {
      // Registrar intento fallido
      await auditService.logAction(
        null,
        AUDIT_ACTIONS.LOGIN_FAILED,
        ENTITY_TYPES.USER,
        null,
        { email, reason: 'Usuario no encontrado' },
        req
      );

      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CREDENTIALS,
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Verificar que el usuario este activo
    if (!user.isActive) {
      await auditService.logAction(
        user.id,
        AUDIT_ACTIONS.LOGIN_FAILED,
        ENTITY_TYPES.USER,
        user.id,
        { reason: 'Usuario inactivo' },
        req
      );

      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.USER_INACTIVE,
        code: 'USER_INACTIVE',
      });
    }

    // Verificar password
    const isValidPassword = await authModel.verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      await auditService.logAction(
        user.id,
        AUDIT_ACTIONS.LOGIN_FAILED,
        ENTITY_TYPES.USER,
        user.id,
        { reason: 'Password incorrecta' },
        req
      );

      return res.status(401).json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CREDENTIALS,
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Verificar que el email este verificado
    if (user.emailVerified === false) {
      return res.status(403).json({
        success: false,
        error: ERROR_MESSAGES.EMAIL_NOT_VERIFIED,
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    // Generar token JWT
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const token = jwt.sign(
      { userId: user.id, email: user.email, roleId: user.roleId },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    // Calcular fecha de expiracion
    const expiresAt = new Date();
    const hoursMatch = expiresIn.match(/(\d+)h/);
    if (hoursMatch) {
      expiresAt.setHours(expiresAt.getHours() + parseInt(hoursMatch[1]));
    } else {
      expiresAt.setHours(expiresAt.getHours() + 24); // Default 24h
    }

    // Crear hash del token para almacenar en sesion
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Obtener IP y User-Agent
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.connection?.remoteAddress
      || req.socket?.remoteAddress
      || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || null;

    // Crear sesion
    await authModel.createSession(user.id, tokenHash, expiresAt, ipAddress, userAgent);

    // Extraer permisos
    const permissions = authModel.extractPermissions(user);

    // Registrar login exitoso
    await auditService.logAction(
      user.id,
      AUDIT_ACTIONS.LOGIN_SUCCESS,
      ENTITY_TYPES.SESSION,
      null,
      { method: 'email_password' },
      req
    );

    // Responder con token y datos del usuario
    return res.status(200).json({
      success: true,
      data: {
        token,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: {
            id: user.role.id,
            name: user.role.name,
            description: user.role.description,
          },
        },
        permissions,
      },
    });
  } catch (error) {
    console.error('[AuthController] Error en login:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

/**
 * Registro de nuevo usuario
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { email, password, fullName } = req.body;

    // Validar campos requeridos
    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'Email, password y nombre completo son requeridos.',
        code: 'MISSING_FIELDS',
      });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de email invalido.',
        code: 'INVALID_EMAIL',
      });
    }

    // Validar longitud de password
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'La password debe tener al menos 8 caracteres.',
        code: 'WEAK_PASSWORD',
      });
    }

    // Verificar si el email ya existe
    const existingUser = await authModel.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: ERROR_MESSAGES.USER_EXISTS,
        code: 'USER_EXISTS',
      });
    }

    // Obtener rol por defecto (USER)
    const defaultRole = await authModel.getDefaultRole();
    if (!defaultRole) {
      console.error('[AuthController] Rol USER no encontrado en la base de datos');
      return res.status(500).json({
        success: false,
        error: 'Error de configuracion del sistema.',
        code: 'MISSING_DEFAULT_ROLE',
      });
    }

    // Crear usuario
    const user = await authModel.createUser({
      email,
      password,
      fullName,
      roleId: defaultRole.id,
    });

    // Registrar en auditoria
    await auditService.logAction(
      user.id,
      AUDIT_ACTIONS.REGISTER,
      ENTITY_TYPES.USER,
      user.id,
      { email: user.email },
      req
    );

    // Generar PIN de verificacion y enviar email
    try {
      const pin = await emailVerificationModel.createPin(user.id);
      const { subject, html } = emailTemplates.verificationPinEmail(pin, user.fullName);
      await emailService.sendEmail({ to: user.email, subject, html });

      // Siempre imprimir en consola para desarrollo
      console.log(`[Register] PIN de verificacion para ${user.email}: ${pin}`);
    } catch (emailErr) {
      // No falla el registro si el email no se envia
      console.error('[Register] Error enviando email de verificacion:', emailErr.message);
    }

    // Responder sin password hash
    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          emailVerified: false,
        },
      },
      message: 'Usuario registrado. Revisa tu correo para verificar tu cuenta.',
    });
  } catch (error) {
    console.error('[AuthController] Error en register:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

/**
 * Obtener usuario actual
 * GET /api/auth/me
 */
async function me(req, res) {
  try {
    // El usuario ya viene del middleware verifyToken
    const user = await authModel.findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado.',
        code: 'USER_NOT_FOUND',
      });
    }

    const permissions = authModel.extractPermissions(user);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          role: {
            id: user.role.id,
            name: user.role.name,
            description: user.role.description,
          },
        },
        permissions,
      },
    });
  } catch (error) {
    console.error('[AuthController] Error en me:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

/**
 * Cerrar sesion
 * POST /api/auth/logout
 */
async function logout(req, res) {
  try {
    // Revocar la sesion actual
    await authModel.revokeSession(req.tokenHash, req.user.id);

    // Registrar logout en auditoria
    await auditService.logAction(
      req.user.id,
      AUDIT_ACTIONS.LOGOUT,
      ENTITY_TYPES.SESSION,
      null,
      null,
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Sesion cerrada exitosamente.',
    });
  } catch (error) {
    console.error('[AuthController] Error en logout:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

module.exports = {
  login,
  register,
  me,
  logout,
};
