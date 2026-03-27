// =====================================================
// SISTEMA IRIS - Audit Logger Utility
// Registra acciones en audit_log
// =====================================================

const prisma = require('../config/prisma');

/**
 * Registra una accion en el audit_log
 * @param {Object} params - Parametros del log
 * @param {number|null} params.actorUserId - ID del usuario que realiza la accion
 * @param {string} params.actionCode - Codigo de la accion (ej: 'CASE_CREATE')
 * @param {string|null} params.entityType - Tipo de entidad (ej: 'Case', 'Evidence')
 * @param {number|null} params.entityId - ID de la entidad afectada
 * @param {Object|null} params.details - Detalles adicionales en JSON
 * @param {string|null} params.ipAddress - Direccion IP del cliente
 * @param {string|null} params.userAgent - User agent del cliente
 */
async function logAudit({
  actorUserId,
  actionCode,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        actionCode,
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
        userIdRegistration: actorUserId,
      },
    });
  } catch (error) {
    // Log error pero no interrumpir el flujo principal
    console.error('[AuditLog] Error al registrar:', error.message);
  }
}

/**
 * Extrae IP y User Agent del request
 * @param {Object} req - Express request object
 * @returns {Object} - { ipAddress, userAgent }
 */
function extractRequestInfo(req) {
  const ipAddress = req.ip ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.connection?.remoteAddress ||
    null;
  const userAgent = req.headers['user-agent'] || null;
  return { ipAddress, userAgent };
}

module.exports = {
  logAudit,
  extractRequestInfo,
};
