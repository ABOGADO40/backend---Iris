// =====================================================
// SISTEMA IRIS - Servicio de Auditoria
// Fecha: 2026-01-19
// =====================================================

const prisma = require('../config/prisma');

/**
 * Registra una accion en el log de auditoria
 * @param {number|null} userId - ID del usuario que realiza la accion
 * @param {string} actionCode - Codigo de la accion (de AUDIT_ACTIONS)
 * @param {string|null} entityType - Tipo de entidad afectada
 * @param {number|null} entityId - ID de la entidad afectada
 * @param {object|null} details - Detalles adicionales de la accion
 * @param {object|null} req - Objeto request de Express para extraer IP y User-Agent
 * @returns {Promise<object>} - Registro de auditoria creado
 */
async function logAction(userId, actionCode, entityType = null, entityId = null, details = null, req = null) {
  try {
    // Extraer IP y User-Agent del request si esta disponible
    let ipAddress = null;
    let userAgent = null;

    if (req) {
      // Obtener IP considerando proxies
      ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.connection?.remoteAddress
        || req.socket?.remoteAddress
        || null;

      // Limpiar IPv6 localhost
      if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
        ipAddress = '127.0.0.1';
      }

      userAgent = req.headers['user-agent'] || null;
    }

    const auditLog = await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        actionCode,
        entityType,
        entityId,
        details: details ? details : undefined,
        ipAddress,
        userAgent,
        userIdRegistration: userId,
      },
    });

    return auditLog;
  } catch (error) {
    // No lanzar error para no interrumpir el flujo principal
    console.error('[AuditService] Error al registrar auditoria:', error.message);
    return null;
  }
}

/**
 * Obtiene logs de auditoria con filtros
 * @param {object} filters - Filtros de busqueda
 * @param {number} page - Pagina actual
 * @param {number} limit - Limite por pagina
 * @returns {Promise<object>} - Lista paginada de logs
 */
async function getLogs(filters = {}, page = 1, limit = 50) {
  const where = {};

  if (filters.userId) {
    where.actorUserId = filters.userId;
  }

  if (filters.actionCode) {
    where.actionCode = filters.actionCode;
  }

  if (filters.entityType) {
    where.entityType = filters.entityType;
  }

  if (filters.entityId) {
    where.entityId = filters.entityId;
  }

  if (filters.startDate || filters.endDate) {
    where.dateTimeRegistration = {};
    if (filters.startDate) {
      where.dateTimeRegistration.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.dateTimeRegistration.lte = new Date(filters.endDate);
    }
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        dateTimeRegistration: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  logAction,
  getLogs,
};
