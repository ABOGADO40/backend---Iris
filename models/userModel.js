// =====================================================
// SISTEMA IRIS - User Model
// Modelo para gestion administrativa de usuarios
// Solo accesible por SUPER_ADMIN
// =====================================================

const prisma = require('../config/prisma');
const bcrypt = require('bcrypt');
const AppError = require('../utils/AppError');

const SALT_ROUNDS = 12;

const userModel = {
  /**
   * Obtener todos los usuarios con paginacion y filtros
   * @param {Object} filters - Filtros de busqueda
   * @returns {Promise<Object>} - Lista paginada de usuarios
   */
  async getAllUsers(filters = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      roleId,
      isActive,
      sortBy = 'dateTimeRegistration',
      sortOrder = 'desc',
    } = filters;

    const skip = (page - 1) * limit;
    const take = Math.min(parseInt(limit, 10), 100);

    // Construir condiciones de busqueda
    const where = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (roleId) {
      where.roleId = parseInt(roleId, 10);
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === true;
    }

    // Validar campo de ordenamiento
    const validSortFields = ['id', 'email', 'fullName', 'dateTimeRegistration', 'roleId'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'dateTimeRegistration';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: {
          [orderField]: orderDir,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isActive: true,
          emailVerified: true,
          roleId: true,
          dateTimeRegistration: true,
          dateTimeModification: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          _count: {
            select: {
              cases: true,
              evidences: true,
              analysisRequests: true,
              sessions: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page: parseInt(page, 10),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  /**
   * Obtener un usuario por ID
   * @param {number} id - ID del usuario
   * @returns {Promise<Object>} - Usuario encontrado
   */
  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id, 10) },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        emailVerified: true,
        roleId: true,
        dateTimeRegistration: true,
        dateTimeModification: true,
        userIdRegistration: true,
        userIdModification: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            rolesPermissions: {
              where: { isActive: true },
              select: {
                permission: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            cases: true,
            evidences: true,
            analysisRequests: true,
            tags: true,
            sessions: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
    }

    // Formatear permisos
    const permissions = user.role.rolesPermissions.map((rp) => ({
      id: rp.permission.id,
      code: rp.permission.code,
      name: rp.permission.name,
    }));

    return {
      ...user,
      role: {
        id: user.role.id,
        name: user.role.name,
        description: user.role.description,
      },
      permissions,
    };
  },

  /**
   * Crear un nuevo usuario
   * @param {Object} data - Datos del usuario
   * @param {number} creatorId - ID del usuario que crea
   * @returns {Promise<Object>} - Usuario creado
   */
  async createUser(data, creatorId) {
    const { email, password, fullName, roleId, isActive = true } = data;

    // Verificar que el email no existe
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      throw new AppError('Ya existe un usuario con ese correo electronico', 409, 'EMAIL_EXISTS');
    }

    // Verificar que el rol existe
    const role = await prisma.role.findUnique({
      where: { id: parseInt(roleId, 10) },
    });

    if (!role) {
      throw new AppError('El rol especificado no existe', 400, 'INVALID_ROLE');
    }

    // Hash del password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: fullName ? fullName.trim() : null,
        roleId: parseInt(roleId, 10),
        isActive,
        emailVerified: true,
        userIdRegistration: creatorId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        emailVerified: true,
        roleId: true,
        dateTimeRegistration: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return user;
  },

  /**
   * Actualizar un usuario
   * @param {number} id - ID del usuario
   * @param {Object} data - Datos a actualizar
   * @param {number} modifierId - ID del usuario que modifica
   * @returns {Promise<Object>} - Usuario actualizado
   */
  async updateUser(id, data, modifierId) {
    const userId = parseInt(id, 10);
    const { email, password, fullName, roleId, isActive } = data;

    // Verificar que el usuario existe
    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
    }

    // Si se cambia el email, verificar que no exista
    if (email && email.toLowerCase().trim() !== existing.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (emailExists) {
        throw new AppError('Ya existe un usuario con ese correo electronico', 409, 'EMAIL_EXISTS');
      }
    }

    // Si se cambia el rol, verificar que existe
    if (roleId) {
      const role = await prisma.role.findUnique({
        where: { id: parseInt(roleId, 10) },
      });

      if (!role) {
        throw new AppError('El rol especificado no existe', 400, 'INVALID_ROLE');
      }
    }

    // Construir objeto de actualizacion
    const updateData = {
      userIdModification: modifierId,
      dateTimeModification: new Date(),
    };

    if (email) {
      updateData.email = email.toLowerCase().trim();
    }

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    if (fullName !== undefined) {
      updateData.fullName = fullName ? fullName.trim() : null;
    }

    if (roleId) {
      updateData.roleId = parseInt(roleId, 10);
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        emailVerified: true,
        roleId: true,
        dateTimeRegistration: true,
        dateTimeModification: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return user;
  },

  /**
   * Desactivar un usuario (soft delete)
   * @param {number} id - ID del usuario
   * @param {number} modifierId - ID del usuario que desactiva
   * @returns {Promise<Object>} - Usuario desactivado
   */
  async deactivateUser(id, modifierId) {
    const userId = parseInt(id, 10);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
    }

    // No permitir desactivar al propio usuario
    if (userId === modifierId) {
      throw new AppError('No puede desactivar su propia cuenta', 400, 'CANNOT_SELF_DEACTIVATE');
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        userIdModification: modifierId,
        dateTimeModification: new Date(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
      },
    });
  },

  /**
   * Reactivar un usuario
   * @param {number} id - ID del usuario
   * @param {number} modifierId - ID del usuario que reactiva
   * @returns {Promise<Object>} - Usuario reactivado
   */
  async activateUser(id, modifierId) {
    const userId = parseInt(id, 10);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        userIdModification: modifierId,
        dateTimeModification: new Date(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
      },
    });
  },

  /**
   * Obtener todos los roles disponibles
   * @returns {Promise<Array>} - Lista de roles
   */
  async getAllRoles() {
    return prisma.role.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Obtener estadisticas de usuarios
   * @returns {Promise<Object>} - Estadisticas
   */
  async getUserStats() {
    const [total, active, inactive, byRole] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.groupBy({
        by: ['roleId'],
        _count: { id: true },
      }),
    ]);

    // Obtener nombres de roles
    const roles = await prisma.role.findMany({
      select: { id: true, name: true },
    });

    const roleMap = new Map(roles.map((r) => [r.id, r.name]));

    return {
      total,
      active,
      inactive,
      byRole: byRole.map((item) => ({
        roleId: item.roleId,
        roleName: roleMap.get(item.roleId) || 'Unknown',
        count: item._count.id,
      })),
    };
  },

  /**
   * Revocar todas las sesiones de un usuario
   * @param {number} userId - ID del usuario
   * @param {number} modifierId - ID del usuario que revoca
   * @returns {Promise<number>} - Numero de sesiones revocadas
   */
  async revokeAllSessions(userId, modifierId) {
    const result = await prisma.session.updateMany({
      where: {
        userId: parseInt(userId, 10),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        userIdModification: modifierId,
        dateTimeModification: new Date(),
      },
    });

    return result.count;
  },

  /**
   * Obtener sesiones activas de un usuario
   * @param {number} userId - ID del usuario
   * @returns {Promise<Array>} - Lista de sesiones
   */
  async getUserSessions(userId) {
    return prisma.session.findMany({
      where: {
        userId: parseInt(userId, 10),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        dateTimeRegistration: true,
        expiresAt: true,
      },
      orderBy: { dateTimeRegistration: 'desc' },
    });
  },
};

module.exports = userModel;
