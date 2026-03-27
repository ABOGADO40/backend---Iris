// =====================================================
// SISTEMA IRIS - Audit Model
// Modelo para gestionar logs de auditoria
// Solo accesible por SUPER_ADMIN
// =====================================================

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const auditModel = {
  /**
   * Registrar una accion en el log de auditoria
   * @param {Object} data - Datos del log
   * @returns {Promise<Object>} - Log creado
   */
  async logAction(data) {
    return prisma.auditLog.create({
      data: {
        actorUserId: data.actorUserId || null,
        actionCode: data.actionCode,
        entityType: data.entityType || null,
        entityId: data.entityId || null,
        details: data.details || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        userIdRegistration: data.actorUserId || null,
      },
    });
  },

  /**
   * Obtener logs de auditoria con filtros
   * @param {Object} filters - Filtros de busqueda
   * @returns {Promise<Object>} - Lista paginada de logs
   */
  async getAuditLogs(filters = {}) {
    const {
      page = 1,
      limit = 50,
      actionCode,
      entityType,
      entityId,
      actorUserId,
      startDate,
      endDate,
      search,
    } = filters;

    const skip = (page - 1) * limit;
    const take = Math.min(parseInt(limit, 10), 100); // Maximo 100 registros

    // Construir condiciones de busqueda
    const where = {};

    if (actionCode) {
      where.actionCode = actionCode;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = parseInt(entityId, 10);
    }

    if (actorUserId) {
      where.actorUserId = parseInt(actorUserId, 10);
    }

    // Filtro por rango de fechas
    if (startDate || endDate) {
      where.dateTimeRegistration = {};
      if (startDate) {
        where.dateTimeRegistration.gte = new Date(startDate);
      }
      if (endDate) {
        // Agregar un dia para incluir todo el dia final
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.dateTimeRegistration.lt = end;
      }
    }

    // Busqueda por texto en actionCode o detalles
    if (search) {
      where.OR = [
        { actionCode: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Ejecutar queries en paralelo
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: {
          dateTimeRegistration: 'desc',
        },
        include: {
          actorUser: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page: parseInt(page, 10),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  /**
   * Obtener un log de auditoria por ID
   * @param {number} id - ID del log
   * @returns {Promise<Object|null>} - Log encontrado
   */
  async getAuditLogById(id) {
    const log = await prisma.auditLog.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!log) {
      throw new AppError('Log de auditoria no encontrado', 404, 'AUDIT_LOG_NOT_FOUND');
    }

    return log;
  },

  /**
   * Exportar logs de auditoria
   * @param {Object} filters - Filtros de busqueda
   * @param {string} format - Formato de exportacion (csv o pdf)
   * @returns {Promise<Object>} - Datos para exportar
   */
  async exportAuditLogs(filters = {}, format = 'csv') {
    const {
      actionCode,
      entityType,
      actorUserId,
      startDate,
      endDate,
    } = filters;

    // Construir condiciones de busqueda
    const where = {};

    if (actionCode) {
      where.actionCode = actionCode;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (actorUserId) {
      where.actorUserId = parseInt(actorUserId, 10);
    }

    if (startDate || endDate) {
      where.dateTimeRegistration = {};
      if (startDate) {
        where.dateTimeRegistration.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.dateTimeRegistration.lt = end;
      }
    }

    // Obtener todos los logs (limitado a 10000 para evitar problemas de memoria)
    const logs = await prisma.auditLog.findMany({
      where,
      take: 10000,
      orderBy: {
        dateTimeRegistration: 'desc',
      },
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    if (format === 'csv') {
      return auditModel.generateCSV(logs);
    } else if (format === 'pdf') {
      return auditModel.generatePDFData(logs);
    }

    throw new AppError('Formato de exportacion no soportado', 400, 'INVALID_FORMAT');
  },

  /**
   * Generar CSV de los logs
   * @param {Array} logs - Lista de logs
   * @returns {string} - Contenido CSV
   */
  generateCSV(logs) {
    const headers = [
      'ID',
      'Fecha/Hora',
      'Usuario',
      'Email',
      'Accion',
      'Tipo Entidad',
      'ID Entidad',
      'IP',
      'Detalles',
    ];

    const rows = logs.map((log) => [
      log.id,
      log.dateTimeRegistration.toISOString(),
      log.actorUser?.fullName || 'Sistema',
      log.actorUser?.email || 'N/A',
      log.actionCode,
      log.entityType || 'N/A',
      log.entityId || 'N/A',
      log.ipAddress || 'N/A',
      log.details ? JSON.stringify(log.details).replace(/"/g, '""') : 'N/A',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return {
      content: csvContent,
      filename: `audit_logs_${new Date().toISOString().split('T')[0]}.csv`,
      mimeType: 'text/csv',
    };
  },

  /**
   * Generar datos para PDF de los logs
   * @param {Array} logs - Lista de logs
   * @returns {Object} - Datos estructurados para PDF
   */
  generatePDFData(logs) {
    return {
      title: 'Reporte de Auditoria - Sistema IRIS',
      generatedAt: new Date().toISOString(),
      totalRecords: logs.length,
      data: logs.map((log) => ({
        id: log.id,
        fecha: log.dateTimeRegistration.toISOString(),
        usuario: log.actorUser?.fullName || 'Sistema',
        email: log.actorUser?.email || 'N/A',
        accion: log.actionCode,
        tipoEntidad: log.entityType || 'N/A',
        idEntidad: log.entityId || 'N/A',
        ip: log.ipAddress || 'N/A',
        detalles: log.details,
      })),
      filename: `audit_logs_${new Date().toISOString().split('T')[0]}.pdf`,
      mimeType: 'application/pdf',
    };
  },

  /**
   * Obtener estadisticas de auditoria
   * @param {Object} filters - Filtros opcionales
   * @returns {Promise<Object>} - Estadisticas
   */
  async getAuditStats(filters = {}) {
    const { startDate, endDate } = filters;

    const where = {};
    if (startDate || endDate) {
      where.dateTimeRegistration = {};
      if (startDate) {
        where.dateTimeRegistration.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.dateTimeRegistration.lt = end;
      }
    }

    // Contar por tipo de accion
    const byAction = await prisma.auditLog.groupBy({
      by: ['actionCode'],
      where,
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 20,
    });

    // Contar por tipo de entidad
    const byEntity = await prisma.auditLog.groupBy({
      by: ['entityType'],
      where,
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    // Total de registros
    const total = await prisma.auditLog.count({ where });

    return {
      total,
      byAction: byAction.map((item) => ({
        action: item.actionCode,
        count: item._count.id,
      })),
      byEntity: byEntity
        .filter((item) => item.entityType !== null)
        .map((item) => ({
          entity: item.entityType,
          count: item._count.id,
        })),
    };
  },

  /**
   * Obtener acciones disponibles para filtrar
   * @returns {Promise<Array>} - Lista de acciones unicas
   */
  async getAvailableActions() {
    const actions = await prisma.auditLog.findMany({
      distinct: ['actionCode'],
      select: {
        actionCode: true,
      },
      orderBy: {
        actionCode: 'asc',
      },
    });

    return actions.map((a) => a.actionCode);
  },

  /**
   * Obtener tipos de entidad disponibles para filtrar
   * @returns {Promise<Array>} - Lista de tipos de entidad unicos
   */
  async getAvailableEntityTypes() {
    const entities = await prisma.auditLog.findMany({
      distinct: ['entityType'],
      select: {
        entityType: true,
      },
      where: {
        entityType: {
          not: null,
        },
      },
      orderBy: {
        entityType: 'asc',
      },
    });

    return entities.map((e) => e.entityType);
  },
};

module.exports = auditModel;
