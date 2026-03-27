// =====================================================
// SISTEMA IRIS - Export Model
// Modelo para gestionar exportaciones
// =====================================================

const prisma = require('../config/prisma');

// =====================================================
// CONSTANTES
// =====================================================

const EXPORT_FORMATS = {
  PDF: 'PDF',
  DOCX: 'DOCX',
  PPTX: 'PPTX'
};

// =====================================================
// FUNCIONES DEL MODELO
// =====================================================

/**
 * Crea un registro de exportacion
 * @param {number} resultId - ID del resultado de analisis
 * @param {string} format - Formato de exportacion (PDF, DOCX, PPTX)
 * @param {string} storagePath - Ruta del archivo
 * @param {number} fileSize - Tamano del archivo en bytes
 * @param {number} [createdBy] - ID del usuario que crea
 * @returns {Promise<Object>} - Exportacion creada
 */
async function createExport(resultId, format, storagePath, fileSize, createdBy = null) {
  if (!resultId || typeof resultId !== 'number') {
    throw new Error('resultId es requerido y debe ser un numero');
  }
  if (!format || !Object.values(EXPORT_FORMATS).includes(format.toUpperCase())) {
    throw new Error(`format debe ser uno de: ${Object.values(EXPORT_FORMATS).join(', ')}`);
  }
  if (!storagePath || typeof storagePath !== 'string') {
    throw new Error('storagePath es requerido');
  }

  const exportRecord = await prisma.export.create({
    data: {
      analysisResultId: resultId,
      format: format.toUpperCase(),
      storagePath,
      fileSizeBytes: BigInt(fileSize || 0),
      downloadCount: 0,
      userIdRegistration: createdBy
    }
  });

  // Convertir BigInt a number para serializacion JSON
  return {
    ...exportRecord,
    fileSizeBytes: Number(exportRecord.fileSizeBytes)
  };
}

/**
 * Obtiene todas las exportaciones de un resultado
 * @param {number} resultId - ID del resultado de analisis
 * @returns {Promise<Array>} - Lista de exportaciones
 */
async function getExportsByResult(resultId) {
  if (!resultId || typeof resultId !== 'number') {
    throw new Error('resultId es requerido y debe ser un numero');
  }

  const exports = await prisma.export.findMany({
    where: { analysisResultId: resultId },
    orderBy: { dateTimeRegistration: 'desc' }
  });

  // Convertir BigInt a number
  return exports.map(exp => ({
    ...exp,
    fileSizeBytes: Number(exp.fileSizeBytes)
  }));
}

/**
 * Incrementa el contador de descargas
 * @param {number} exportId - ID de la exportacion
 * @param {number} [modifiedBy] - ID del usuario que modifica
 * @returns {Promise<Object>} - Exportacion actualizada
 */
async function incrementDownloadCount(exportId, modifiedBy = null) {
  if (!exportId || typeof exportId !== 'number') {
    throw new Error('exportId es requerido y debe ser un numero');
  }

  const exportRecord = await prisma.export.update({
    where: { id: exportId },
    data: {
      downloadCount: { increment: 1 },
      dateTimeModification: new Date(),
      userIdModification: modifiedBy
    }
  });

  return {
    ...exportRecord,
    fileSizeBytes: Number(exportRecord.fileSizeBytes)
  };
}

/**
 * Obtiene una exportacion por ID con validacion de usuario
 * @param {number} id - ID de la exportacion
 * @param {number} userId - ID del usuario (para validar propiedad)
 * @returns {Promise<Object|null>} - Exportacion o null si no existe/no autorizado
 */
async function getExportById(id, userId) {
  if (!id || typeof id !== 'number') {
    throw new Error('id es requerido y debe ser un numero');
  }

  const exportRecord = await prisma.export.findFirst({
    where: {
      id,
      ...(userId && { analysisResult: { analysisRequest: { requesterUserId: userId } } }),
    },
    include: {
      analysisResult: {
        include: {
          analysisRequest: {
            select: {
              id: true,
              serviceType: true,
              requesterUserId: true
            }
          }
        }
      }
    }
  });

  if (!exportRecord) {
    return null;
  }

  return {
    ...exportRecord,
    fileSizeBytes: Number(exportRecord.fileSizeBytes)
  };
}

/**
 * Verifica si el usuario tiene acceso a un resultado de analisis
 * @param {number} resultId - ID del resultado
 * @param {number} userId - ID del usuario
 * @returns {Promise<boolean>} - true si tiene acceso
 */
async function userHasAccessToResult(resultId, userId) {
  if (!resultId) {
    return false;
  }
  // userId null = SUPER_ADMIN tiene acceso a todo
  if (!userId) return true;

  const result = await prisma.analysisResult.findFirst({
    where: {
      id: resultId,
      analysisRequest: {
        requesterUserId: userId
      }
    },
    select: { id: true }
  });

  return result !== null;
}

/**
 * Obtiene un resultado de analisis con su solicitud
 * @param {number} resultId - ID del resultado
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} - Resultado o null
 */
async function getResultWithRequest(resultId, userId) {
  if (!resultId || typeof resultId !== 'number') {
    throw new Error('resultId es requerido y debe ser un numero');
  }

  const result = await prisma.analysisResult.findFirst({
    where: {
      id: resultId,
      ...(userId && { analysisRequest: { requesterUserId: userId } }),
    },
    include: {
      analysisRequest: {
        select: {
          id: true,
          serviceType: true,
          aiProvider: true,
          aiModel: true,
          dateTimeRegistration: true
        }
      }
    }
  });

  return result;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createExport,
  getExportsByResult,
  incrementDownloadCount,
  getExportById,
  userHasAccessToResult,
  getResultWithRequest,
  EXPORT_FORMATS
};
