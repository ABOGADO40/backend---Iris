// =====================================================
// SISTEMA IRIS - User Controller
// Controlador para gestion administrativa de usuarios
// Solo accesible por SUPER_ADMIN
// =====================================================

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../utils/constants');
const asyncHandler = require('../utils/asyncHandler');

const userController = {
  /**
   * Obtener todos los usuarios con paginacion y filtros
   * GET /api/users
   * Solo SUPER_ADMIN
   */
  getAll: asyncHandler(async (req, res) => {
    const filters = {
      page: req.query.page || 1,
      limit: req.query.limit || 20,
      search: req.query.search,
      roleId: req.query.roleId,
      isActive: req.query.isActive,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
    };

    const result = await userModel.getAllUsers(filters);

    res.status(200).json({
      success: true,
      ...result,
    });
  }),

  /**
   * Obtener un usuario por ID
   * GET /api/users/:id
   * Solo SUPER_ADMIN
   */
  getById: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    const user = await userModel.getUserById(userId);

    res.status(200).json({
      success: true,
      data: user,
    });
  }),

  /**
   * Crear un nuevo usuario
   * POST /api/users
   * Solo SUPER_ADMIN
   */
  create: asyncHandler(async (req, res) => {
    const { email, password, fullName, roleId, isActive } = req.body;
    const creatorId = req.user.id;

    const user = await userModel.createUser(
      { email, password, fullName, roleId, isActive },
      creatorId
    );

    // Registrar en auditoria
    await auditModel.logAction({
      actorUserId: creatorId,
      actionCode: 'USER_CREATE',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email, roleId: user.roleId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: user,
    });
  }),

  /**
   * Actualizar un usuario
   * PUT /api/users/:id
   * Solo SUPER_ADMIN
   */
  update: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const modifierId = req.user.id;
    const { email, password, fullName, roleId, isActive } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    const user = await userModel.updateUser(
      userId,
      { email, password, fullName, roleId, isActive },
      modifierId
    );

    // Registrar en auditoria
    await auditModel.logAction({
      actorUserId: modifierId,
      actionCode: 'USER_UPDATE',
      entityType: 'User',
      entityId: user.id,
      details: {
        updatedFields: Object.keys(req.body).filter((k) => k !== 'password'),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: user,
    });
  }),

  /**
   * Desactivar un usuario
   * POST /api/users/:id/deactivate
   * Solo SUPER_ADMIN
   */
  deactivate: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const modifierId = req.user.id;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    const user = await userModel.deactivateUser(userId, modifierId);

    // Revocar todas las sesiones del usuario
    await userModel.revokeAllSessions(userId, modifierId);

    // Registrar en auditoria
    await auditModel.logAction({
      actorUserId: modifierId,
      actionCode: 'USER_DEACTIVATE',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Usuario desactivado exitosamente',
      data: user,
    });
  }),

  /**
   * Reactivar un usuario
   * POST /api/users/:id/activate
   * Solo SUPER_ADMIN
   */
  activate: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const modifierId = req.user.id;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    const user = await userModel.activateUser(userId, modifierId);

    // Registrar en auditoria
    await auditModel.logAction({
      actorUserId: modifierId,
      actionCode: 'USER_ACTIVATE',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Usuario reactivado exitosamente',
      data: user,
    });
  }),

  /**
   * Eliminar un usuario (eliminacion logica)
   * DELETE /api/users/:id
   * Solo SUPER_ADMIN
   */
  delete: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const modifierId = req.user.id;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    const user = await userModel.deleteUser(userId, modifierId);

    // Registrar en auditoria
    await auditModel.logAction({
      actorUserId: modifierId,
      actionCode: 'USER_DELETE',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email, fullName: user.fullName },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Usuario eliminado exitosamente',
      data: user,
    });
  }),

  /**
   * Obtener todos los roles disponibles
   * GET /api/users/roles
   * Solo SUPER_ADMIN
   */
  getRoles: asyncHandler(async (req, res) => {
    const roles = await userModel.getAllRoles();

    res.status(200).json({
      success: true,
      data: roles,
    });
  }),

  /**
   * Obtener estadisticas de usuarios
   * GET /api/users/stats
   * Solo SUPER_ADMIN
   */
  getStats: asyncHandler(async (req, res) => {
    const stats = await userModel.getUserStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  }),

  /**
   * Revocar todas las sesiones de un usuario
   * POST /api/users/:id/revoke-sessions
   * Solo SUPER_ADMIN
   */
  revokeSessions: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const modifierId = req.user.id;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    const count = await userModel.revokeAllSessions(userId, modifierId);

    // Registrar en auditoria
    await auditModel.logAction({
      actorUserId: modifierId,
      actionCode: 'USER_SESSIONS_REVOKED',
      entityType: 'User',
      entityId: userId,
      details: { sessionsRevoked: count },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: `${count} sesiones revocadas exitosamente`,
      data: { sessionsRevoked: count },
    });
  }),

  /**
   * Obtener sesiones activas de un usuario
   * GET /api/users/:id/sessions
   * Solo SUPER_ADMIN
   */
  getSessions: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    const sessions = await userModel.getUserSessions(userId);

    res.status(200).json({
      success: true,
      data: sessions,
      total: sessions.length,
    });
  }),
  /**
   * Resetear password de un usuario (genera password temporal)
   * POST /api/users/:id/reset-password
   */
  resetPassword: asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario invalido',
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'No puedes resetear tu propia contrasena desde aqui.',
      });
    }

    const temporaryPassword = crypto.randomBytes(6).toString('base64url').slice(0, 10) + 'A1!';
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const user = await userModel.resetPassword(userId, passwordHash, req.user.id);

    await auditService.logAction(
      req.user.id,
      AUDIT_ACTIONS.USER_PASSWORD_RESET,
      ENTITY_TYPES.USER,
      userId,
      { targetEmail: user.email, resetBy: req.user.email },
      req
    );

    res.status(200).json({
      success: true,
      data: { temporaryPassword },
      message: `Contrasena reseteada para ${user.email}. El usuario debera cambiarla al iniciar sesion.`,
    });
  }),
};

module.exports = userController;
