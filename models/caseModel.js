// =====================================================
// SISTEMA IRIS - Case Model
// Modelo de datos para Casos
// =====================================================

const prisma = require('../config/prisma');
const { logAudit } = require('../utils/auditLogger');

/**
 * Crea un nuevo caso
 * @param {number} userId - ID del usuario propietario
 * @param {Object} data - Datos del caso
 * @param {string} data.title - Titulo del caso
 * @param {string} data.description - Descripcion del caso
 * @param {Date|string} data.caseDate - Fecha del caso
 * @param {Object} requestInfo - Info del request (ip, userAgent)
 * @returns {Promise<Object>} - Caso creado
 */
async function createCase(userId, data, requestInfo = {}) {
  const { title, description, caseDate } = data;

  const newCase = await prisma.case.create({
    data: {
      ownerUserId: userId,
      title,
      description: description || null,
      caseDate: new Date(caseDate),
      userIdRegistration: userId,
    },
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId,
    actionCode: 'CASE_CREATE',
    entityType: 'Case',
    entityId: newCase.id,
    details: { title, caseDate },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return newCase;
}

/**
 * Obtiene todos los casos de un usuario
 * @param {number} userId - ID del usuario
 * @param {Object} options - Opciones de busqueda
 * @param {number} options.page - Numero de pagina (default 1)
 * @param {number} options.limit - Registros por pagina (default 20)
 * @param {string} options.search - Busqueda en titulo/descripcion
 * @param {string} options.sortBy - Campo para ordenar (default 'dateTimeRegistration')
 * @param {string} options.sortOrder - Orden (asc/desc, default 'desc')
 * @returns {Promise<Object>} - { cases, total, page, totalPages }
 */
async function getCasesByUser(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    search = '',
    sortBy = 'dateTimeRegistration',
    sortOrder = 'desc',
    fechaDesde = null,
    fechaHasta = null,
  } = options;

  const skip = (page - 1) * limit;

  // Construir filtros (userId null = SUPER_ADMIN ve todo)
  const where = { status: 'ACTIVE' };
  if (userId) where.ownerUserId = userId;

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Filtro por rango de fechas (campo caseDate)
  if (fechaDesde || fechaHasta) {
    where.caseDate = {};
    if (fechaDesde) {
      where.caseDate.gte = new Date(fechaDesde + 'T00:00:00.000Z');
    }
    if (fechaHasta) {
      where.caseDate.lte = new Date(fechaHasta + 'T23:59:59.999Z');
    }
  }

  // Campos permitidos para ordenar
  const allowedSortFields = ['dateTimeRegistration', 'caseDate', 'title'];
  const orderByField = allowedSortFields.includes(sortBy) ? sortBy : 'dateTimeRegistration';
  const orderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';

  const [cases, total] = await Promise.all([
    prisma.case.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderByField]: orderByDirection },
      include: {
        _count: {
          select: {
            caseEvidences: true,
            caseTags: true,
            analysisRequests: true,
          },
        },
      },
    }),
    prisma.case.count({ where }),
  ]);

  return {
    cases,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Obtiene un caso por ID (solo si pertenece al usuario)
 * @param {number} id - ID del caso
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} - Caso o null si no existe/no pertenece
 */
async function getCaseById(id, userId) {
  const caseData = await prisma.case.findFirst({
    where: {
      id,
      status: 'ACTIVE',
      ...(userId && { ownerUserId: userId }),
    },
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      caseEvidences: {
        include: {
          evidence: {
            include: {
              evidenceFile: {
                select: {
                  originalFilename: true,
                  mimeType: true,
                  sizeBytes: true,
                },
              },
              evidenceText: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
      caseTags: {
        include: {
          tag: true,
        },
      },
      _count: {
        select: {
          analysisRequests: true,
        },
      },
    },
  });

  return caseData;
}

/**
 * Actualiza un caso
 * @param {number} id - ID del caso
 * @param {number} userId - ID del usuario
 * @param {Object} data - Datos a actualizar
 * @param {Object} requestInfo - Info del request (ip, userAgent)
 * @returns {Promise<Object|null>} - Caso actualizado o null si no existe
 */
async function updateCase(id, userId, data, requestInfo = {}) {
  // Verificar que el caso exista, este activo y pertenezca al usuario
  const existingCase = await prisma.case.findFirst({
    where: {
      id,
      status: 'ACTIVE',
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!existingCase) {
    return null;
  }

  const { title, description, caseDate,
    descriptionFilePath, descriptionFileName, descriptionFileMime, descriptionFileSize } = data;

  const updateData = {
    userIdModification: userId,
    dateTimeModification: new Date(),
  };

  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (caseDate !== undefined) updateData.caseDate = new Date(caseDate);
  if (descriptionFilePath !== undefined) updateData.descriptionFilePath = descriptionFilePath;
  if (descriptionFileName !== undefined) updateData.descriptionFileName = descriptionFileName;
  if (descriptionFileMime !== undefined) updateData.descriptionFileMime = descriptionFileMime;
  if (descriptionFileSize !== undefined) updateData.descriptionFileSize = descriptionFileSize;

  const updatedCase = await prisma.case.update({
    where: { id },
    data: updateData,
    include: {
      owner: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId,
    actionCode: 'CASE_UPDATE',
    entityType: 'Case',
    entityId: id,
    details: { changedFields: Object.keys(data) },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return updatedCase;
}

/**
 * Adjunta una evidencia a un caso
 * @param {number} caseId - ID del caso
 * @param {number} evidenceId - ID de la evidencia
 * @param {number} userId - ID del usuario
 * @param {Object} requestInfo - Info del request
 * @returns {Promise<Object|null>} - Relacion creada o null si no existe caso/evidencia
 */
async function attachEvidence(caseId, evidenceId, userId, requestInfo = {}) {
  // Verificar que el caso exista, este activo y pertenezca al usuario
  const caseExists = await prisma.case.findFirst({
    where: {
      id: caseId,
      status: 'ACTIVE',
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!caseExists) {
    return { error: 'CASE_NOT_FOUND' };
  }

  // Verificar que la evidencia exista (y pertenezca al usuario si no es admin)
  const evidenceExists = await prisma.evidence.findFirst({
    where: {
      id: evidenceId,
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!evidenceExists) {
    return { error: 'EVIDENCE_NOT_FOUND' };
  }

  // Verificar si ya existe la relacion
  const existingRelation = await prisma.caseEvidence.findUnique({
    where: {
      caseId_evidenceId: {
        caseId,
        evidenceId,
      },
    },
  });

  if (existingRelation) {
    return { error: 'ALREADY_ATTACHED' };
  }

  // Crear la relacion
  const caseEvidence = await prisma.caseEvidence.create({
    data: {
      caseId,
      evidenceId,
      userIdRegistration: userId,
    },
    include: {
      evidence: {
        include: {
          evidenceFile: {
            select: {
              originalFilename: true,
              mimeType: true,
            },
          },
          evidenceText: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId,
    actionCode: 'CASE_EVIDENCE_ATTACH',
    entityType: 'CaseEvidence',
    entityId: caseEvidence.id,
    details: { caseId, evidenceId },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return caseEvidence;
}

/**
 * Desvincula una evidencia de un caso
 * @param {number} caseId - ID del caso
 * @param {number} evidenceId - ID de la evidencia
 * @param {number} userId - ID del usuario (null = SUPER_ADMIN)
 * @param {Object} requestInfo - Info del request
 * @returns {Promise<Object>} - Resultado o error
 */
async function detachEvidence(caseId, evidenceId, userId, requestInfo = {}) {
  // Verificar que el caso exista, este activo y pertenezca al usuario
  const caseExists = await prisma.case.findFirst({
    where: {
      id: caseId,
      status: 'ACTIVE',
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!caseExists) {
    return { error: 'CASE_NOT_FOUND' };
  }

  // Verificar que la relacion exista
  const existingRelation = await prisma.caseEvidence.findUnique({
    where: {
      caseId_evidenceId: {
        caseId,
        evidenceId,
      },
    },
  });

  if (!existingRelation) {
    return { error: 'NOT_ATTACHED' };
  }

  // Eliminar la relacion
  await prisma.caseEvidence.delete({
    where: {
      caseId_evidenceId: {
        caseId,
        evidenceId,
      },
    },
  });

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId,
    actionCode: 'CASE_EVIDENCE_DETACH',
    entityType: 'CaseEvidence',
    entityId: existingRelation.id,
    details: { caseId, evidenceId },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return { caseId, evidenceId };
}

/**
 * Obtiene las evidencias de un caso
 * @param {number} caseId - ID del caso
 * @param {number} userId - ID del usuario
 * @returns {Promise<Array|null>} - Lista de evidencias o null si no existe el caso
 */
async function getCaseEvidences(caseId, userId) {
  // Verificar que el caso exista, este activo y pertenezca al usuario
  const caseExists = await prisma.case.findFirst({
    where: {
      id: caseId,
      status: 'ACTIVE',
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!caseExists) {
    return null;
  }

  const caseEvidences = await prisma.caseEvidence.findMany({
    where: {
      caseId,
    },
    include: {
      evidence: {
        include: {
          evidenceFile: {
            select: {
              originalFilename: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
          evidenceText: {
            select: {
              id: true,
              textContent: true,
            },
          },
        },
      },
    },
    orderBy: {
      dateTimeRegistration: 'desc',
    },
  });

  // Mapear para devolver la evidencia con su ID correcto (no el ID de la relación)
  return caseEvidences.map((ce) => {
    const ev = ce.evidence;
    return {
      id: ev.id,  // ID de la evidencia, no de la relación
      caseEvidenceId: ce.id,  // ID de la relación por si se necesita
      attachedAt: ce.dateTimeRegistration,
      title: ev.title,
      titulo: ev.title,
      evidenceType: ev.evidenceType,
      tipo: ev.evidenceType === 'FILE' ? 'archivo' : 'texto',
      tipoEvidencia: ev.tipoEvidencia,
      notes: ev.notes,
      notas: ev.notes,
      dateTimeRegistration: ev.dateTimeRegistration,
      evidenceFile: ev.evidenceFile ? {
        ...ev.evidenceFile,
        sizeBytes: ev.evidenceFile.sizeBytes?.toString(),
      } : null,
      evidenceText: ev.evidenceText,
      contenido: ev.evidenceText?.textContent || null,
    };
  });
}

/**
 * Cuenta el total de casos de un usuario
 * @param {number} userId - ID del usuario
 * @returns {Promise<number>} - Total de casos
 */
async function countCasesByUser(userId) {
  const where = { status: 'ACTIVE' };
  if (userId) where.ownerUserId = userId;
  return prisma.case.count({ where });
}

/**
 * Actualiza solo los campos de archivo de descripcion de un caso
 */
async function updateCaseFile(caseId, fileData) {
  return prisma.case.update({
    where: { id: caseId },
    data: {
      descriptionFilePath: fileData.descriptionFilePath || null,
      descriptionFileName: fileData.descriptionFileName || null,
      descriptionFileMime: fileData.descriptionFileMime || null,
      descriptionFileSize: fileData.descriptionFileSize || null,
      dateTimeModification: new Date(),
    },
  });
}

/**
 * Eliminacion logica de un caso
 * - Cambia status a 'DELETED'
 * - Elimina registros de case_evidences (las evidencias persisten)
 * - Elimina registros de case_tags
 * - analysis_requests mantienen su caseId (historico accesible)
 * @param {number} id - ID del caso
 * @param {number} userId - ID del usuario (null = SUPER_ADMIN)
 * @param {Object} requestInfo - Info del request (ip, userAgent)
 * @returns {Promise<Object|null>} - Caso marcado como eliminado o null si no existe
 */
async function deleteCase(id, userId, requestInfo = {}) {
  const existingCase = await prisma.case.findFirst({
    where: {
      id,
      status: 'ACTIVE',
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!existingCase) {
    return null;
  }

  await prisma.$transaction([
    // Desvincular evidencias (las evidencias persisten)
    prisma.caseEvidence.deleteMany({ where: { caseId: id } }),
    // Eliminar tags del caso
    prisma.caseTag.deleteMany({ where: { caseId: id } }),
    // Marcar caso como eliminado
    prisma.case.update({
      where: { id },
      data: {
        status: 'DELETED',
        userIdModification: userId || existingCase.ownerUserId,
        dateTimeModification: new Date(),
      },
    }),
  ]);

  await logAudit({
    actorUserId: userId || existingCase.ownerUserId,
    actionCode: 'CASE_DELETE',
    entityType: 'Case',
    entityId: id,
    details: { title: existingCase.title },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return existingCase;
}

module.exports = {
  createCase,
  getCasesByUser,
  getCaseById,
  updateCase,
  updateCaseFile,
  attachEvidence,
  detachEvidence,
  getCaseEvidences,
  countCasesByUser,
  deleteCase,
};
