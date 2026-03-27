// =====================================================
// SISTEMA IRIS - Analysis Model
// Modelo para gestionar analisis de IA
// =====================================================

const prisma = require('../config/prisma');

// =====================================================
// CONSTANTES
// =====================================================

const REQUEST_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

const SERVICE_TYPES = {
  TRANSLATE: 'TRANSLATE',
  RECOMMEND: 'RECOMMEND',
  COMPARE: 'COMPARE',
  OBJECTIONS: 'OBJECTIONS'
};

// =====================================================
// FUNCIONES DEL MODELO
// =====================================================

/**
 * Crea una nueva solicitud de analisis
 * @param {number} userId - ID del usuario que solicita
 * @param {string} serviceType - Tipo de servicio (TRANSLATE, RECOMMEND, COMPARE, OBJECTIONS)
 * @param {Object} data - Datos adicionales
 * @param {number} [data.evidenceId] - ID de la evidencia principal
 * @param {number} [data.caseId] - ID del caso
 * @param {number} [data.evidenceIdB] - ID de la segunda evidencia (para comparacion)
 * @param {string} [data.inputFreeText] - Texto libre de entrada
 * @param {string} [data.aiProvider] - Proveedor de IA utilizado
 * @param {string} [data.aiModel] - Modelo de IA utilizado
 * @returns {Promise<Object>} - Solicitud creada
 */
async function createRequest(userId, serviceType, data = {}) {
  if (!userId || typeof userId !== 'number') {
    throw new Error('userId es requerido y debe ser un numero');
  }
  if (!serviceType || !Object.values(SERVICE_TYPES).includes(serviceType)) {
    throw new Error(`serviceType debe ser uno de: ${Object.values(SERVICE_TYPES).join(', ')}`);
  }

  const request = await prisma.analysisRequest.create({
    data: {
      requesterUserId: userId,
      serviceType,
      evidenceId: data.evidenceId || null,
      caseId: data.caseId || null,
      evidenceIdB: data.evidenceIdB || null,
      inputFreeText: data.inputFreeText || null,
      status: REQUEST_STATUS.PENDING,
      aiProvider: data.aiProvider || null,
      aiModel: data.aiModel || null,
      userIdRegistration: userId
    }
  });

  return request;
}

/**
 * Actualiza el estado de una solicitud
 * @param {number} id - ID de la solicitud
 * @param {string} status - Nuevo estado
 * @param {string} [errorMessage] - Mensaje de error si aplica
 * @param {number} [modifiedBy] - ID del usuario que modifica
 * @returns {Promise<Object>} - Solicitud actualizada
 */
async function updateRequestStatus(id, status, errorMessage = null, modifiedBy = null) {
  if (!id || typeof id !== 'number') {
    throw new Error('id es requerido y debe ser un numero');
  }
  if (!status || !Object.values(REQUEST_STATUS).includes(status)) {
    throw new Error(`status debe ser uno de: ${Object.values(REQUEST_STATUS).join(', ')}`);
  }

  const updateData = {
    status,
    dateTimeModification: new Date()
  };

  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  if (modifiedBy) {
    updateData.userIdModification = modifiedBy;
  }

  const request = await prisma.analysisRequest.update({
    where: { id },
    data: updateData
  });

  return request;
}

/**
 * Crea un resultado de analisis
 * @param {number} requestId - ID de la solicitud
 * @param {string} resultText - Texto del resultado
 * @param {Object} [structuredJson] - JSON estructurado del resultado
 * @param {number} [createdBy] - ID del usuario que crea
 * @returns {Promise<Object>} - Resultado creado
 */
async function createResult(requestId, resultText, structuredJson = null, createdBy = null) {
  if (!requestId || typeof requestId !== 'number') {
    throw new Error('requestId es requerido y debe ser un numero');
  }
  if (!resultText || typeof resultText !== 'string') {
    throw new Error('resultText es requerido y debe ser una cadena');
  }

  const result = await prisma.analysisResult.create({
    data: {
      analysisRequestId: requestId,
      resultText,
      resultStructuredJson: structuredJson,
      disclaimerIncluded: true,
      userIdRegistration: createdBy
    }
  });

  return result;
}

/**
 * Obtiene solicitudes de un usuario con filtros
 * @param {number} userId - ID del usuario
 * @param {Object} [filters] - Filtros opcionales
 * @param {string} [filters.serviceType] - Tipo de servicio
 * @param {string} [filters.status] - Estado de la solicitud
 * @param {Date} [filters.fromDate] - Fecha desde
 * @param {Date} [filters.toDate] - Fecha hasta
 * @param {number} [filters.page] - Pagina (default 1)
 * @param {number} [filters.limit] - Limite por pagina (default 20)
 * @returns {Promise<{data: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function getRequestsByUser(userId, filters = {}) {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
  const skip = (page - 1) * limit;

  // userId null = SUPER_ADMIN ve todo
  const where = {};
  if (userId) where.requesterUserId = userId;

  if (filters.serviceType && Object.values(SERVICE_TYPES).includes(filters.serviceType)) {
    where.serviceType = filters.serviceType;
  }

  if (filters.status && Object.values(REQUEST_STATUS).includes(filters.status)) {
    where.status = filters.status;
  }

  if (filters.caseId) {
    where.caseId = parseInt(filters.caseId);
  }

  if (filters.fromDate || filters.toDate) {
    where.dateTimeRegistration = {};
    if (filters.fromDate) {
      where.dateTimeRegistration.gte = new Date(filters.fromDate);
    }
    if (filters.toDate) {
      where.dateTimeRegistration.lte = new Date(filters.toDate);
    }
  }

  const [data, total] = await Promise.all([
    prisma.analysisRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { dateTimeRegistration: 'desc' },
      include: {
        evidence: {
          select: {
            id: true,
            title: true,
            evidenceType: true,
            tipoEvidencia: true
          }
        },
        case: {
          select: {
            id: true,
            title: true
          }
        },
        evidenceB: {
          select: {
            id: true,
            title: true,
            evidenceType: true
          }
        },
        analysisResult: {
          select: {
            id: true,
            dateTimeRegistration: true
          }
        }
      }
    }),
    prisma.analysisRequest.count({ where })
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Obtiene una solicitud por ID
 * @param {number} id - ID de la solicitud
 * @param {number} userId - ID del usuario (para validar propiedad)
 * @returns {Promise<Object|null>} - Solicitud o null si no existe
 */
async function getRequestById(id, userId) {
  if (!id || typeof id !== 'number') {
    throw new Error('id es requerido y debe ser un numero');
  }

  const request = await prisma.analysisRequest.findFirst({
    where: {
      id,
      ...(userId && { requesterUserId: userId }),
    },
    include: {
      evidence: {
        include: {
          evidenceText: true,
          evidenceFile: true
        }
      },
      case: true,
      evidenceB: {
        include: {
          evidenceText: true,
          evidenceFile: true
        }
      },
      analysisResult: {
        include: {
          exports: true
        }
      }
    }
  });

  return request;
}

/**
 * Obtiene resultado por ID de solicitud
 * @param {number} requestId - ID de la solicitud
 * @param {number} userId - ID del usuario (para validar propiedad)
 * @returns {Promise<Object|null>} - Resultado o null si no existe
 */
async function getResultByRequestId(requestId, userId) {
  if (!requestId || typeof requestId !== 'number') {
    throw new Error('requestId es requerido y debe ser un numero');
  }

  const result = await prisma.analysisResult.findFirst({
    where: {
      analysisRequestId: requestId,
      ...(userId && { analysisRequest: { requesterUserId: userId } }),
    },
    include: {
      analysisRequest: {
        select: {
          id: true,
          serviceType: true,
          status: true,
          aiProvider: true,
          aiModel: true,
          dateTimeRegistration: true
        }
      },
      exports: {
        select: {
          id: true,
          format: true,
          downloadCount: true,
          dateTimeRegistration: true
        }
      }
    }
  });

  return result;
}

/**
 * Busqueda full-text en resultados del usuario
 * @param {number} userId - ID del usuario
 * @param {string} query - Termino de busqueda
 * @param {number} [page] - Pagina (default 1)
 * @param {number} [limit] - Limite por pagina (default 20)
 * @returns {Promise<{data: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
async function searchResults(userId, query, page = 1, limit = 20) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('query es requerido y debe ser una cadena no vacia');
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (pageNum - 1) * limitNum;
  const searchTerm = query.trim().toLowerCase();

  // userId null = SUPER_ADMIN ve todo
  const whereClause = {
    ...(userId && { analysisRequest: { requesterUserId: userId } }),
    resultText: {
      contains: searchTerm,
      mode: 'insensitive'
    }
  };

  // Busqueda en resultados usando ILIKE para PostgreSQL
  const [data, total] = await Promise.all([
    prisma.analysisResult.findMany({
      where: whereClause,
      skip,
      take: limitNum,
      orderBy: { dateTimeRegistration: 'desc' },
      include: {
        analysisRequest: {
          select: {
            id: true,
            serviceType: true,
            status: true,
            dateTimeRegistration: true,
            evidence: {
              select: {
                id: true,
                title: true
              }
            },
            case: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }
      }
    }),
    prisma.analysisResult.count({ where: whereClause })
  ]);

  return {
    data,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum)
  };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createRequest,
  updateRequestStatus,
  createResult,
  getRequestsByUser,
  getRequestById,
  getResultByRequestId,
  searchResults,
  REQUEST_STATUS,
  SERVICE_TYPES
};
