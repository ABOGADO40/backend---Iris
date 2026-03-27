// =====================================================
// SISTEMA IRIS - Evidence Model
// Modelo de datos para Evidencias
// =====================================================

const prisma = require('../config/prisma');
const { logAudit } = require('../utils/auditLogger');

/**
 * Crea una nueva evidencia (registro base)
 * @param {number} userId - ID del usuario propietario
 * @param {Object} data - Datos de la evidencia
 * @param {string} data.evidenceType - Tipo: 'FILE' o 'TEXT'
 * @param {string} data.title - Titulo de la evidencia
 * @param {string} data.tipoEvidencia - Tipo de evidencia opcional
 * @param {string} data.notes - Notas adicionales
 * @param {Object} requestInfo - Info del request
 * @returns {Promise<Object>} - Evidencia creada
 */
async function createEvidence(userId, data, requestInfo = {}) {
  const { evidenceType, title, tipoEvidencia, notes } = data;

  const evidence = await prisma.evidence.create({
    data: {
      ownerUserId: userId,
      evidenceType,
      title: title || null,
      tipoEvidencia: tipoEvidencia || null,
      notes: notes || null,
      userIdRegistration: userId,
    },
  });

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId,
    actionCode: 'EVIDENCE_CREATE',
    entityType: 'Evidence',
    entityId: evidence.id,
    details: { evidenceType, title },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return evidence;
}

/**
 * Crea el registro de archivo para una evidencia
 * @param {number} evidenceId - ID de la evidencia
 * @param {Object} fileData - Datos del archivo
 * @param {string} fileData.originalFilename - Nombre original
 * @param {string} fileData.mimeType - Tipo MIME
 * @param {BigInt} fileData.sizeBytes - Tamano en bytes
 * @param {string} fileData.storagePath - Ruta de almacenamiento
 * @param {string} fileData.checksumSha256 - Checksum SHA256
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} - EvidenceFile creado
 */
async function createEvidenceFile(evidenceId, fileData, userId) {
  const { originalFilename, mimeType, sizeBytes, storagePath, checksumSha256 } = fileData;

  const evidenceFile = await prisma.evidenceFile.create({
    data: {
      evidenceId,
      originalFilename,
      mimeType: mimeType || null,
      sizeBytes: BigInt(sizeBytes),
      storagePath,
      checksumSha256: checksumSha256 || null,
      userIdRegistration: userId,
    },
  });

  return evidenceFile;
}

/**
 * Crea el registro de texto para una evidencia
 * @param {number} evidenceId - ID de la evidencia
 * @param {string} textContent - Contenido de texto
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} - EvidenceText creado
 */
async function createEvidenceText(evidenceId, textContent, userId) {
  const evidenceText = await prisma.evidenceText.create({
    data: {
      evidenceId,
      textContent,
      userIdRegistration: userId,
    },
  });

  return evidenceText;
}

/**
 * Obtiene todas las evidencias de un usuario
 * @param {number} userId - ID del usuario
 * @param {Object} options - Opciones de busqueda
 * @param {number} options.page - Numero de pagina
 * @param {number} options.limit - Registros por pagina
 * @param {string} options.search - Busqueda en titulo/notas
 * @param {string} options.type - Filtro por tipo (FILE/TEXT)
 * @param {number} options.caseId - Filtro por caso vinculado
 * @param {string} options.sortBy - Campo para ordenar
 * @param {string} options.sortOrder - Orden (asc/desc)
 * @returns {Promise<Object>} - { evidences, total, page, totalPages }
 */
async function getEvidencesByUser(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    search = '',
    type = '',
    caseId = null,
    sortBy = 'dateTimeRegistration',
    sortOrder = 'desc',
  } = options;

  const skip = (page - 1) * limit;

  // Construir filtros (userId null = SUPER_ADMIN ve todo)
  const where = {};
  if (userId) where.ownerUserId = userId;

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (type && ['FILE', 'TEXT'].includes(type.toUpperCase())) {
    where.evidenceType = type.toUpperCase();
  }

  if (caseId) {
    where.caseEvidences = {
      some: {
        caseId: parseInt(caseId, 10),
      },
    };
  }

  // Campos permitidos para ordenar
  const allowedSortFields = ['dateTimeRegistration', 'title', 'evidenceType'];
  const orderByField = allowedSortFields.includes(sortBy) ? sortBy : 'dateTimeRegistration';
  const orderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';

  const [evidences, total] = await Promise.all([
    prisma.evidence.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderByField]: orderByDirection },
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
        caseEvidences: {
          include: {
            case: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        _count: {
          select: {
            caseEvidences: true,
            evidenceTags: true,
          },
        },
      },
    }),
    prisma.evidence.count({ where }),
  ]);

  // Serializar BigInt a string para JSON
  const serializedEvidences = evidences.map((ev) => ({
    ...ev,
    evidenceFile: ev.evidenceFile
      ? {
          ...ev.evidenceFile,
          sizeBytes: ev.evidenceFile.sizeBytes.toString(),
        }
      : null,
  }));

  return {
    evidences: serializedEvidences,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Obtiene una evidencia por ID (solo si pertenece al usuario)
 * @param {number} id - ID de la evidencia
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} - Evidencia o null
 */
async function getEvidenceById(id, userId) {
  const evidence = await prisma.evidence.findFirst({
    where: {
      id,
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
      evidenceFile: true,
      evidenceText: {
        select: {
          id: true,
          textContent: true,
        },
      },
      caseEvidences: {
        include: {
          case: {
            select: {
              id: true,
              title: true,
              caseDate: true,
            },
          },
        },
      },
      evidenceTags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (!evidence) return null;

  // Serializar BigInt
  if (evidence.evidenceFile) {
    evidence.evidenceFile.sizeBytes = evidence.evidenceFile.sizeBytes.toString();
  }

  return evidence;
}

/**
 * Obtiene el contenido de una evidencia (archivo path o texto)
 * @param {number} id - ID de la evidencia
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} - Contenido o null
 */
async function getEvidenceContent(id, userId) {
  const evidence = await prisma.evidence.findFirst({
    where: {
      id,
      ...(userId && { ownerUserId: userId }),
    },
    include: {
      evidenceFile: true,
      evidenceText: true,
    },
  });

  if (!evidence) return null;

  if (evidence.evidenceType === 'FILE' && evidence.evidenceFile) {
    return {
      type: 'FILE',
      originalFilename: evidence.evidenceFile.originalFilename,
      mimeType: evidence.evidenceFile.mimeType,
      sizeBytes: evidence.evidenceFile.sizeBytes.toString(),
      storagePath: evidence.evidenceFile.storagePath,
    };
  }

  if (evidence.evidenceType === 'TEXT' && evidence.evidenceText) {
    return {
      type: 'TEXT',
      textContent: evidence.evidenceText.textContent,
    };
  }

  return null;
}

/**
 * Crea un caso a partir de una evidencia existente
 * @param {number} evidenceId - ID de la evidencia
 * @param {Object} caseData - Datos del caso a crear
 * @param {string} caseData.title - Titulo del caso
 * @param {string} caseData.description - Descripcion
 * @param {Date|string} caseData.caseDate - Fecha del caso
 * @param {number} userId - ID del usuario
 * @param {Object} requestInfo - Info del request
 * @returns {Promise<Object>} - Caso creado con evidencia adjunta
 */
async function createCaseFromEvidence(evidenceId, caseData, userId, requestInfo = {}) {
  // Verificar que la evidencia exista (y pertenezca al usuario si no es admin)
  const evidence = await prisma.evidence.findFirst({
    where: {
      id: evidenceId,
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!evidence) {
    return { error: 'EVIDENCE_NOT_FOUND' };
  }

  const { title, description, caseDate } = caseData;

  // Crear caso y adjuntar evidencia en una transaccion
  const result = await prisma.$transaction(async (tx) => {
    // Crear el caso
    const newCase = await tx.case.create({
      data: {
        ownerUserId: userId,
        title,
        description: description || null,
        caseDate: new Date(caseDate),
        userIdRegistration: userId,
      },
    });

    // Adjuntar la evidencia
    await tx.caseEvidence.create({
      data: {
        caseId: newCase.id,
        evidenceId,
        userIdRegistration: userId,
      },
    });

    // Obtener el caso con la evidencia adjunta
    const caseWithEvidence = await tx.case.findUnique({
      where: { id: newCase.id },
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
      },
    });

    return caseWithEvidence;
  });

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId,
    actionCode: 'CASE_CREATE_FROM_EVIDENCE',
    entityType: 'Case',
    entityId: result.id,
    details: { evidenceId, title },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return result;
}

/**
 * Actualiza los datos de una evidencia
 * @param {number} id - ID de la evidencia
 * @param {Object} data - Datos a actualizar
 * @param {string} data.title - Nuevo titulo
 * @param {string} data.tipoEvidencia - Nuevo tipo de evidencia
 * @param {string} data.notes - Nuevas notas
 * @param {string} data.textContent - Nuevo contenido (solo para TEXT)
 * @param {number} userId - ID del usuario
 * @param {Object} requestInfo - Info del request
 * @returns {Promise<Object|null>} - Evidencia actualizada o null si no se encontro
 */
async function updateEvidence(id, data, userId, requestInfo = {}) {
  // Verificar que la evidencia exista y pertenezca al usuario
  const evidence = await prisma.evidence.findFirst({
    where: {
      id,
      ...(userId && { ownerUserId: userId }),
    },
  });

  if (!evidence) return null;

  const { title, tipoEvidencia, notes, textContent } = data;

  // Actualizar la evidencia base
  await prisma.evidence.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(tipoEvidencia !== undefined && { tipoEvidencia }),
      ...(notes !== undefined && { notes }),
      userIdModification: userId,
    },
  });

  // Si es tipo TEXT y viene textContent, actualizar el texto
  if (evidence.evidenceType === 'TEXT' && textContent !== undefined) {
    await prisma.evidenceText.updateMany({
      where: { evidenceId: id },
      data: {
        textContent,
        userIdModification: userId,
      },
    });
  }

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId,
    actionCode: 'EVIDENCE_UPDATE',
    entityType: 'Evidence',
    entityId: id,
    details: { title, tipoEvidencia },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  // Retornar la evidencia completa actualizada
  return getEvidenceById(id, userId);
}

/**
 * Cuenta el total de evidencias de un usuario
 * @param {number} userId - ID del usuario
 * @returns {Promise<number>} - Total de evidencias
 */
async function countEvidencesByUser(userId) {
  const where = {};
  if (userId) where.ownerUserId = userId;
  return prisma.evidence.count({ where });
}

/**
 * Elimina una evidencia y todos sus registros relacionados
 * @param {number} id - ID de la evidencia
 * @param {number} userId - ID del usuario (null = SUPER_ADMIN)
 * @param {Object} requestInfo - Info del request
 * @returns {Promise<Object|null>} - Evidencia eliminada o null si no existe
 */
async function deleteEvidence(id, userId, requestInfo = {}) {
  // Verificar que la evidencia exista y pertenezca al usuario
  const evidence = await prisma.evidence.findFirst({
    where: {
      id,
      ...(userId && { ownerUserId: userId }),
    },
    include: {
      evidenceFile: { select: { id: true, storagePath: true } },
    },
  });

  if (!evidence) return null;

  // Guardar info del archivo para limpieza posterior
  const fileInfo = evidence.evidenceFile;

  await prisma.$transaction([
    // 1. Desvincular de analysis_requests (FK nullable → SET NULL)
    prisma.analysisRequest.updateMany({
      where: { evidenceId: id },
      data: { evidenceId: null },
    }),
    prisma.analysisRequest.updateMany({
      where: { evidenceIdB: id },
      data: { evidenceIdB: null },
    }),
    // 2. Eliminar relaciones junction
    prisma.caseEvidence.deleteMany({ where: { evidenceId: id } }),
    prisma.evidenceTag.deleteMany({ where: { evidenceId: id } }),
    // 3. Eliminar evidenceFile (cascadea: processedDocument→extractedImages, transcription, videoFrames)
    prisma.evidenceFile.deleteMany({ where: { evidenceId: id } }),
    // 4. Eliminar evidenceText
    prisma.evidenceText.deleteMany({ where: { evidenceId: id } }),
    // 5. Eliminar la evidencia (cascadea: whatsappChat→whatsappMessages)
    prisma.evidence.delete({ where: { id } }),
  ]);

  // Registrar en audit_log
  await logAudit({
    actorUserId: userId || evidence.ownerUserId,
    actionCode: 'EVIDENCE_DELETE',
    entityType: 'Evidence',
    entityId: id,
    details: { title: evidence.title, evidenceType: evidence.evidenceType },
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });

  return { ...evidence, fileInfo };
}

module.exports = {
  createEvidence,
  createEvidenceFile,
  createEvidenceText,
  getEvidencesByUser,
  getEvidenceById,
  getEvidenceContent,
  updateEvidence,
  createCaseFromEvidence,
  countEvidencesByUser,
  deleteEvidence,
};
