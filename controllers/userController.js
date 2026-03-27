// =====================================================
// SISTEMA IRIS - User Controller
// Controlador para gestion administrativa de usuarios
// Solo accesible por SUPER_ADMIN
// =====================================================

const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
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
};

module.exports = userController;
