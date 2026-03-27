// =====================================================
// SISTEMA IRIS - Request Normalizer
// Valida y normaliza peticiones HTTP para los pipelines IA
// =====================================================

const { getCaseContext, createEvidenceFromUpload } = require('./helpers/evidenceHelper');

// Campos especificos por servicio que se extraen del req.body
const SERVICE_PARAMS = {
  TRANSLATE: ['pais', 'objetivo', 'nivelRigor'],
  RECOMMEND: ['pais', 'objetivo', 'nivel_rigor'],
  COMPARE: ['pais', 'objetivo', 'nivel_rigor'],
  OBJECTIONS: ['pais', 'objetivo', 'nivel_rigor']
};

/**
 * Normaliza una peticion HTTP para el pipeline IA correspondiente.
 * Extrae la logica repetida en las 4 funciones del controller:
 * - Parsear body (caseId, evidenceIds, params del servicio)
 * - Procesar archivos subidos → crear evidencias
 * - Obtener contexto del caso + evidencias
 * - Unificar y deduplicar evidencias
 *
 * @param {Object} req - Express request object
 * @param {string} serviceType - 'TRANSLATE' | 'RECOMMEND' | 'COMPARE' | 'OBJECTIONS'
 * @returns {Object} Objeto normalizado o {error, statusCode} si falla validacion
 */
async function normalize(req, serviceType) {
  const userId = req.user.id;
  const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : userId;

  const { caseId, evidenceIds: rawEvidenceIds } = req.body;

  // caseId obligatorio
  if (!caseId) {
    return { error: 'Se requiere caseId', statusCode: 400 };
  }

  const parsedCaseId = parseInt(caseId);
  let evidenceIds = Array.isArray(rawEvidenceIds)
    ? rawEvidenceIds.map(Number).filter(n => !isNaN(n))
    : [];

  // Extraer parametros especificos del servicio
  const paramKeys = SERVICE_PARAMS[serviceType] || [];
  const serviceParams = {};
  for (const key of paramKeys) {
    if (req.body[key] !== undefined) {
      serviceParams[key] = req.body[key];
    }
  }

  // Procesar archivos nuevos subidos → crear evidencias
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  const newEvidenceContents = [];
  const newEvidenceIds = [];

  for (const file of uploadedFiles) {
    try {
      const created = await createEvidenceFromUpload(file, parsedCaseId, userId, serviceType);
      newEvidenceContents.push(created);
      evidenceIds.push(created.evidenceId);
      newEvidenceIds.push(created.evidenceId);
    } catch (uploadErr) {
      console.warn(`[requestNormalizer:${serviceType}] Error creando evidencia desde upload: ${uploadErr.message}`);
    }
  }

  // Obtener contexto del caso + evidencias seleccionadas
  const ctx = await getCaseContext(parsedCaseId, filterUserId, evidenceIds, serviceType);
  if (!ctx) {
    return { error: 'Caso no encontrado', statusCode: 404 };
  }

  // Unificar todas las evidencias en un solo array (deduplicar por evidenceId)
  const allEvidences = [...ctx.evidenceContents];
  for (const nev of newEvidenceContents) {
    const alreadyIncluded = allEvidences.some(e => e.evidenceId === nev.evidenceId);
    if (!alreadyIncluded) {
      allEvidences.push(nev);
    }
  }

  return {
    userId,
    filterUserId,
    parsedCaseId,
    serviceType,
    serviceParams,
    evidenceIds,
    allEvidences,
    caseDescription: ctx.caseDescription,
    caseDescImages: ctx.caseDescImages || [],
    caseDescLocalPath: ctx.caseDescLocalPath || null,
    caseData: ctx.caseData,
    newEvidenceIds
  };
}

module.exports = { normalize };
