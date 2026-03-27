// =====================================================
// SISTEMA IRIS - Tag Model
// Modelo para gestionar etiquetas de casos y evidencias
// =====================================================

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const tagModel = {
  /**
   * Crear una nueva etiqueta
   * @param {number} userId - ID del usuario propietario
   * @param {string} name - Nombre de la etiqueta
   * @param {string} color - Color en formato hex (#RRGGBB)
   * @returns {Promise<Object>} - Tag creado
   */
  async createTag(userId, name, color) {
    // Verificar si ya existe una etiqueta con el mismo nombre para este usuario
    const existing = await prisma.tag.findUnique({
      where: {
        ownerUserId_name: {
          ownerUserId: userId,
          name: name.trim(),
        },
      },
    });

    if (existing) {
      throw new AppError('Ya existe una etiqueta con ese nombre', 409, 'TAG_DUPLICATE');
    }

    return prisma.tag.create({
      data: {
        ownerUserId: userId,
        name: name.trim(),
        color: color || null,
        userIdRegistration: userId,
      },
    });
  },

  /**
   * Obtener todas las etiquetas de un usuario
   * @param {number} userId - ID del usuario
   * @returns {Promise<Array>} - Lista de tags
   */
  async getTagsByUser(userId) {
    return prisma.tag.findMany({
      where: {
        ownerUserId: userId,
      },
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            caseTags: true,
            evidenceTags: true,
          },
        },
      },
    });
  },

  /**
   * Obtener una etiqueta por ID
   * @param {number} id - ID de la etiqueta
   * @param {number} userId - ID del usuario (para verificar propiedad)
   * @returns {Promise<Object|null>} - Tag encontrado o null
   */
  async getTagById(id, userId) {
    const tag = await prisma.tag.findFirst({
      where: {
        id: id,
        ownerUserId: userId,
      },
      include: {
        _count: {
          select: {
            caseTags: true,
            evidenceTags: true,
          },
        },
      },
    });

    if (!tag) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    return tag;
  },

  /**
   * Actualizar una etiqueta
   * @param {number} id - ID de la etiqueta
   * @param {number} userId - ID del usuario
   * @param {Object} data - Datos a actualizar (name, color)
   * @returns {Promise<Object>} - Tag actualizado
   */
  async updateTag(id, userId, data) {
    // Verificar que la etiqueta existe y pertenece al usuario
    const existing = await prisma.tag.findFirst({
      where: {
        id: id,
        ownerUserId: userId,
      },
    });

    if (!existing) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    // Si se cambia el nombre, verificar que no exista otro con ese nombre
    if (data.name && data.name.trim() !== existing.name) {
      const duplicate = await prisma.tag.findUnique({
        where: {
          ownerUserId_name: {
            ownerUserId: userId,
            name: data.name.trim(),
          },
        },
      });

      if (duplicate) {
        throw new AppError('Ya existe una etiqueta con ese nombre', 409, 'TAG_DUPLICATE');
      }
    }

    return prisma.tag.update({
      where: { id: id },
      data: {
        name: data.name ? data.name.trim() : existing.name,
        color: data.color !== undefined ? data.color : existing.color,
        userIdModification: userId,
        dateTimeModification: new Date(),
      },
    });
  },

  /**
   * Eliminar una etiqueta
   * @param {number} id - ID de la etiqueta
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Tag eliminado
   */
  async deleteTag(id, userId) {
    const existing = await prisma.tag.findFirst({
      where: {
        id: id,
        ownerUserId: userId,
      },
    });

    if (!existing) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    // Eliminar en transaccion: primero las relaciones, luego el tag
    return prisma.$transaction(async (tx) => {
      await tx.caseTag.deleteMany({
        where: { tagId: id },
      });

      await tx.evidenceTag.deleteMany({
        where: { tagId: id },
      });

      return tx.tag.delete({
        where: { id: id },
      });
    });
  },

  /**
   * Asignar una etiqueta a un caso
   * @param {number} tagId - ID de la etiqueta
   * @param {number} caseId - ID del caso
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Relacion creada
   */
  async assignTagToCase(tagId, caseId, userId) {
    // Verificar que el tag pertenece al usuario
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!tag) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    // Verificar que el caso pertenece al usuario
    const caseRecord = await prisma.case.findFirst({
      where: {
        id: caseId,
        ownerUserId: userId,
      },
    });

    if (!caseRecord) {
      throw new AppError('Caso no encontrado', 404, 'CASE_NOT_FOUND');
    }

    // Verificar si ya existe la asignacion
    const existingAssignment = await prisma.caseTag.findUnique({
      where: {
        caseId_tagId: {
          caseId: caseId,
          tagId: tagId,
        },
      },
    });

    if (existingAssignment) {
      throw new AppError('La etiqueta ya esta asignada a este caso', 409, 'TAG_ALREADY_ASSIGNED');
    }

    return prisma.caseTag.create({
      data: {
        caseId: caseId,
        tagId: tagId,
        userIdRegistration: userId,
      },
      include: {
        tag: true,
        case: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  },

  /**
   * Asignar una etiqueta a una evidencia
   * @param {number} tagId - ID de la etiqueta
   * @param {number} evidenceId - ID de la evidencia
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Relacion creada
   */
  async assignTagToEvidence(tagId, evidenceId, userId) {
    // Verificar que el tag pertenece al usuario
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!tag) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    // Verificar que la evidencia pertenece al usuario
    const evidence = await prisma.evidence.findFirst({
      where: {
        id: evidenceId,
        ownerUserId: userId,
      },
    });

    if (!evidence) {
      throw new AppError('Evidencia no encontrada', 404, 'EVIDENCE_NOT_FOUND');
    }

    // Verificar si ya existe la asignacion
    const existingAssignment = await prisma.evidenceTag.findUnique({
      where: {
        evidenceId_tagId: {
          evidenceId: evidenceId,
          tagId: tagId,
        },
      },
    });

    if (existingAssignment) {
      throw new AppError('La etiqueta ya esta asignada a esta evidencia', 409, 'TAG_ALREADY_ASSIGNED');
    }

    return prisma.evidenceTag.create({
      data: {
        evidenceId: evidenceId,
        tagId: tagId,
        userIdRegistration: userId,
      },
      include: {
        tag: true,
        evidence: {
          select: {
            id: true,
            title: true,
            evidenceType: true,
          },
        },
      },
    });
  },

  /**
   * Remover una etiqueta de un caso
   * @param {number} tagId - ID de la etiqueta
   * @param {number} caseId - ID del caso
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Resultado de la eliminacion
   */
  async removeTagFromCase(tagId, caseId, userId) {
    // Verificar que el tag pertenece al usuario
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!tag) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    // Verificar que el caso pertenece al usuario
    const caseRecord = await prisma.case.findFirst({
      where: {
        id: caseId,
        ownerUserId: userId,
      },
    });

    if (!caseRecord) {
      throw new AppError('Caso no encontrado', 404, 'CASE_NOT_FOUND');
    }

    // Verificar que existe la asignacion
    const assignment = await prisma.caseTag.findUnique({
      where: {
        caseId_tagId: {
          caseId: caseId,
          tagId: tagId,
        },
      },
    });

    if (!assignment) {
      throw new AppError('La etiqueta no esta asignada a este caso', 404, 'TAG_NOT_ASSIGNED');
    }

    return prisma.caseTag.delete({
      where: {
        caseId_tagId: {
          caseId: caseId,
          tagId: tagId,
        },
      },
    });
  },

  /**
   * Remover una etiqueta de una evidencia
   * @param {number} tagId - ID de la etiqueta
   * @param {number} evidenceId - ID de la evidencia
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Resultado de la eliminacion
   */
  async removeTagFromEvidence(tagId, evidenceId, userId) {
    // Verificar que el tag pertenece al usuario
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!tag) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    // Verificar que la evidencia pertenece al usuario
    const evidence = await prisma.evidence.findFirst({
      where: {
        id: evidenceId,
        ownerUserId: userId,
      },
    });

    if (!evidence) {
      throw new AppError('Evidencia no encontrada', 404, 'EVIDENCE_NOT_FOUND');
    }

    // Verificar que existe la asignacion
    const assignment = await prisma.evidenceTag.findUnique({
      where: {
        evidenceId_tagId: {
          evidenceId: evidenceId,
          tagId: tagId,
        },
      },
    });

    if (!assignment) {
      throw new AppError('La etiqueta no esta asignada a esta evidencia', 404, 'TAG_NOT_ASSIGNED');
    }

    return prisma.evidenceTag.delete({
      where: {
        evidenceId_tagId: {
          evidenceId: evidenceId,
          tagId: tagId,
        },
      },
    });
  },

  /**
   * Obtener todos los casos que tienen una etiqueta especifica
   * @param {number} tagId - ID de la etiqueta
   * @param {number} userId - ID del usuario
   * @returns {Promise<Array>} - Lista de casos
   */
  async getCasesByTag(tagId, userId) {
    // Verificar que el tag pertenece al usuario
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!tag) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    const caseTags = await prisma.caseTag.findMany({
      where: {
        tagId: tagId,
      },
      include: {
        case: {
          include: {
            caseTags: {
              include: {
                tag: true,
              },
            },
            _count: {
              select: {
                caseEvidences: true,
              },
            },
          },
        },
      },
    });

    return caseTags.map((ct) => ct.case);
  },

  /**
   * Obtener todas las evidencias que tienen una etiqueta especifica
   * @param {number} tagId - ID de la etiqueta
   * @param {number} userId - ID del usuario
   * @returns {Promise<Array>} - Lista de evidencias
   */
  async getEvidencesByTag(tagId, userId) {
    // Verificar que el tag pertenece al usuario
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!tag) {
      throw new AppError('Etiqueta no encontrada', 404, 'TAG_NOT_FOUND');
    }

    const evidenceTags = await prisma.evidenceTag.findMany({
      where: {
        tagId: tagId,
      },
      include: {
        evidence: {
          include: {
            evidenceTags: {
              include: {
                tag: true,
              },
            },
            evidenceFile: {
              select: {
                originalFilename: true,
                mimeType: true,
              },
            },
          },
        },
      },
    });

    return evidenceTags.map((et) => et.evidence);
  },

  /**
   * Obtener tags de un caso especifico
   * @param {number} caseId - ID del caso
   * @param {number} userId - ID del usuario
   * @returns {Promise<Array>} - Lista de tags
   */
  async getTagsByCase(caseId, userId) {
    // Verificar que el caso pertenece al usuario
    const caseRecord = await prisma.case.findFirst({
      where: {
        id: caseId,
        ownerUserId: userId,
      },
    });

    if (!caseRecord) {
      throw new AppError('Caso no encontrado', 404, 'CASE_NOT_FOUND');
    }

    const caseTags = await prisma.caseTag.findMany({
      where: {
        caseId: caseId,
      },
      include: {
        tag: true,
      },
    });

    return caseTags.map((ct) => ct.tag);
  },

  /**
   * Obtener tags de una evidencia especifica
   * @param {number} evidenceId - ID de la evidencia
   * @param {number} userId - ID del usuario
   * @returns {Promise<Array>} - Lista de tags
   */
  async getTagsByEvidence(evidenceId, userId) {
    // Verificar que la evidencia pertenece al usuario
    const evidence = await prisma.evidence.findFirst({
      where: {
        id: evidenceId,
        ownerUserId: userId,
      },
    });

    if (!evidence) {
      throw new AppError('Evidencia no encontrada', 404, 'EVIDENCE_NOT_FOUND');
    }

    const evidenceTags = await prisma.evidenceTag.findMany({
      where: {
        evidenceId: evidenceId,
      },
      include: {
        tag: true,
      },
    });

    return evidenceTags.map((et) => et.tag);
  },
};

module.exports = tagModel;
