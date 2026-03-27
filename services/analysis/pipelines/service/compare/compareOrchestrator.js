// =====================================================
// SISTEMA IRIS - Compare Orchestrator
// Orquesta el pipeline completo de comparacion de evidencias
// Exactamente 2 evidencias (A vs B) → 1 sola llamada IA
// 6 variables consolidadas (patron OBJECTIONS)
// =====================================================

const prisma = require('../../../../../config/prisma');
const analysisModel = require('../../../../../models/analysisModel');
const comparePayloadBuilder = require('./comparePayloadBuilder');
const compareAIClient = require('./compareAIClient');
const comparePostprocessor = require('./comparePostprocessor');
const { recordUsage } = require('../../../shared/usageTracker');

/**
 * Trunca un string para log, mostrando inicio y largo total si excede maxLen.
 */
function truncForLog(val, maxLen = 500) {
  if (val === null || val === undefined) return 'null';
  if (typeof val !== 'string') return JSON.stringify(val);
  if (val.length <= maxLen) return val;
  return val.substring(0, maxLen) + `... [${val.length} chars total]`;
}

/**
 * Construye un paquete de texto consolidado para una evidencia.
 * Incluye titulo, tipo, modalidad, metadata y contenido.
 */
function buildPaquete(ev, label) {
  const titulo = ev.title || label;
  const tipo = ev.type || 'Documento';
  const modalidad = ev.modality || 'No especificada';

  // Metadata descriptiva
  const metaParts = [];
  if (ev.type) metaParts.push(`Tipo: ${ev.type}`);
  if (ev.modality) metaParts.push(`Modalidad: ${ev.modality}`);
  if (ev.content?.length > 0) metaParts.push(`${ev.content.length} caracteres`);
  if (ev.images?.length > 0) metaParts.push(`${ev.images.length} imagen(es)`);
  const metadata = metaParts.length > 0 ? metaParts.join(', ') : 'Sin metadata';

  // Contenido de la evidencia
  const contenido = ev.content?.trim()
    ? ev.content
    : ev.images?.length > 0
      ? `Este documento es una imagen (${titulo}). El contenido completo de esta evidencia se encuentra en las imagenes adjuntas etiquetadas como ${label}. Analiza visualmente las imagenes para extraer la informacion pericial.`
      : 'Sin contenido extraido';

  return `DOCUMENTO: ${titulo}\nTIPO: ${tipo}\nMODALIDAD: ${modalidad}\nMETADATA: ${metadata}\n\nCONTENIDO:\n${contenido}`;
}

/**
 * Imprime el log estructurado consolidado de una llamada COMPARE.
 */
function printStructuredLog(payload, aiResult) {
  const { internalVars, config, hasImages, inputImages } = payload;
  const meta = aiResult?.metadata || {};

  const chatApiUrl = config.apiUrl || 'https://api.openai.com/v1/chat/completions';
  const endpoint = meta.endpoint || chatApiUrl.replace(/\/chat\/completions\/?$/, '/responses');
  const modelo = aiResult?.model || meta.model || config.aiModel || 'desconocido';

  const systemFinal = `Stored Prompt ID: ${config.promptId || 'NO CONFIGURADO'}` +
    (config.promptVersion ? `, Version: ${config.promptVersion}` : ', Version: current (latest)');

  let userFinal;
  if (inputImages && inputImages.length > 0) {
    const markers = inputImages.map(i => i.marker).join(', ');
    userFinal = `body.input con ${inputImages.length} imagen(es): [${markers}]`;
  } else {
    userFinal = 'N/A (solo variables de stored prompt, sin body.input)';
  }

  const varsBlock = Object.entries(internalVars || {}).map(([k, v]) => {
    const display = typeof v === 'object' && v !== null
      ? JSON.stringify(v)
      : truncForLog(String(v), 500);
    return `  ${k}: ${display}`;
  }).join('\n');

  const respuesta = aiResult?.success
    ? truncForLog(aiResult.content, 2000)
    : `[ERROR] ${aiResult?.error || 'Sin respuesta'}`;

  const inputImageCount = inputImages ? inputImages.length : 0;
  let imagenesReales;
  if (inputImageCount > 0) {
    imagenesReales = `SI - ${inputImageCount} imagen(es) via body.input: [${inputImages.map(i => `${i.marker}(${i.mimeType})`).join(', ')}]`;
  } else {
    imagenesReales = 'NO - Sin imagenes enviadas';
  }

  const log = `
${'='.repeat(70)}
[COMPARE LOG] Comparacion de Evidencias
${'='.repeat(70)}

MODELO: ${modelo}
ENDPOINT: ${endpoint}

SYSTEM FINAL:
${systemFinal}

USER FINAL:
${userFinal}

VARIABLES (6):
${varsBlock}

RESPUESTA EXACTA DEL MODELO:
${respuesta}

METADATOS DE LA RESPUESTA:
  finish_reason: ${meta.status || 'N/A'}
  refusal: ${meta.refusal || 'null'}
  error: ${aiResult?.success ? 'null' : (aiResult?.error || 'desconocido')}
  annotations: ${meta.annotations && meta.annotations.length > 0 ? JSON.stringify(meta.annotations) : '[]'}
  usage: ${meta.usage ? JSON.stringify(meta.usage) : 'N/A'}
  response_id: ${meta.responseId || 'N/A'}

¿SE ENVIARON IMÁGENES REALES?: ${imagenesReales}
${'='.repeat(70)}`;

  console.log(log);
}

/**
 * Ejecuta el pipeline completo de comparacion
 * @param {Object} normalizedRequest - Resultado de requestNormalizer.normalize()
 * @returns {Promise<{success: boolean, data?: Object, error?: string, details?: string}>}
 */
async function execute(normalizedRequest) {
  const {
    userId,
    parsedCaseId,
    serviceParams,
    evidenceIds,
    allEvidences,
    caseDescription,
    caseDescImages,
    newEvidenceIds
  } = normalizedRequest;

  // Validar minimo 2 evidencias
  if (allEvidences.length < 2) {
    return {
      success: false,
      error: 'Se requieren al menos 2 evidencias para comparar',
      statusCode: 400
    };
  }

  // Parametros del servicio (patron OBJECTIONS)
  const finalPais = serviceParams.pais || 'General';
  const finalObjetivo = serviceParams.objetivo || 'Comparacion integral';
  const finalNivelRigor = serviceParams.nivel_rigor || 'Intermedio';

  // Mapear primeras 2 evidencias como A y B
  const evA = allEvidences[0];
  const evB = allEvidences[1];

  // Construir paquetes consolidados
  const paqueteEvA = buildPaquete(evA, 'Evidencia A');
  const paqueteEvB = buildPaquete(evB, 'Evidencia B');

  // Construir array de imagenes etiquetadas por evidencia
  const allImages = [];
  const imageLabels = [];
  let imgIdx = 1;

  if (evA.images?.length > 0) {
    const start = imgIdx;
    allImages.push(...evA.images);
    imgIdx += evA.images.length;
    imageLabels.push(evA.images.length === 1
      ? `Imagen ${start}: Evidencia A`
      : `Imagenes ${start}-${imgIdx - 1}: Evidencia A`);
  }

  if (evB.images?.length > 0) {
    const start = imgIdx;
    allImages.push(...evB.images);
    imgIdx += evB.images.length;
    imageLabels.push(evB.images.length === 1
      ? `Imagen ${start}: Evidencia B`
      : `Imagenes ${start}-${imgIdx - 1}: Evidencia B`);
  }

  // Imagenes del contexto del caso al final
  if (caseDescImages?.length > 0) {
    const start = imgIdx;
    allImages.push(...caseDescImages);
    imgIdx += caseDescImages.length;
    imageLabels.push(caseDescImages.length === 1
      ? `Imagen ${start}: Contexto del caso`
      : `Imagenes ${start}-${imgIdx - 1}: Contexto del caso`);
  }

  // Contexto descriptivo generico para imagenes
  const imageContext = imageLabels.length > 0
    ? `Las siguientes imagenes son parte de las evidencias del caso.\n${imageLabels.join('\n')}`
    : undefined;

  // Logging diagnostico: trazabilidad de imagenes por evidencia
  console.log(`[compareOrchestrator] === EVIDENCIAS PROCESADAS ===`);
  console.log(`[compareOrchestrator] Evidencia A "${evA.title}": texto=${(evA.content || '').length} chars, imagenes=${(evA.images || []).length}`);
  console.log(`[compareOrchestrator] Evidencia B "${evB.title}": texto=${(evB.content || '').length} chars, imagenes=${(evB.images || []).length}`);
  console.log(`[compareOrchestrator] caseDescImages: ${(caseDescImages || []).length}`);
  console.log(`[compareOrchestrator] Total imagenes recopiladas: ${allImages.length}`);
  console.log(`[compareOrchestrator] imageContext: ${imageContext ? 'generado' : 'no aplica'}`);

  const hasText = paqueteEvA.length > 0 || paqueteEvB.length > 0;
  const hasImages = allImages.length > 0;

  if (!hasText && !hasImages) {
    return {
      success: false,
      error: 'No hay contenido para comparar',
      statusCode: 400
    };
  }

  // Crear solicitud en BD
  const request = await analysisModel.createRequest(userId, 'COMPARE', {
    caseId: parsedCaseId,
    evidenceId: evidenceIds[0] || null,
    evidenceIdB: evidenceIds[1] || null,
    inputFreeText: `[${evA.title}]: ${(evA.content || '').substring(0, 5000)}...\n[${evB.title}]: ${(evB.content || '').substring(0, 5000)}...`
  });

  await analysisModel.updateRequestStatus(request.id, 'PROCESSING', null, userId);

  try {
    const payload = await comparePayloadBuilder.build({
      pais: finalPais,
      objetivo: finalObjetivo,
      nivelRigor: finalNivelRigor,
      paquete_evidencia_1: paqueteEvA,
      paquete_evidencia_2: paqueteEvB,
      contexto_caso_general: caseDescription || 'Sin contexto adicional',
      images: allImages,
      imageContext
    });

    const aiResult = await compareAIClient.call(payload);

    // Log estructurado consolidado
    printStructuredLog(payload, aiResult);

    // Registrar consumo de tokens
    if (aiResult.success) {
      recordUsage({
        userId,
        serviceType: 'COMPARE',
        requestId: request.id,
        caseId: parsedCaseId,
        usage: aiResult.metadata?.usage,
        model: aiResult.model,
        callType: 'primary'
      });
    }

    if (!aiResult.success) {
      await analysisModel.updateRequestStatus(request.id, 'FAILED', aiResult.error, userId);
      return {
        success: false,
        error: 'Error al comparar evidencias',
        details: aiResult.error,
        requestId: request.id,
        auditAction: 'ANALYSIS_COMPARE_FAILED',
        auditDetails: { error: aiResult.error, caseId: parsedCaseId }
      };
    }

    // Postproceso
    const processed = comparePostprocessor.process(aiResult.content, aiResult.provider, aiResult.model);

    // Guardar en BD
    await prisma.analysisRequest.update({
      where: { id: request.id },
      data: { aiProvider: processed.provider, aiModel: processed.model }
    });

    const result = await analysisModel.createResult(request.id, processed.comparison, processed.structuredComparison, userId);
    await analysisModel.updateRequestStatus(request.id, 'COMPLETED', null, userId);

    return {
      success: true,
      data: {
        requestId: request.id,
        resultId: result.id,
        serviceType: 'COMPARE',
        comparison: processed.comparison,
        structuredComparison: processed.structuredComparison,
        disclaimer: processed.disclaimer,
        provider: processed.provider,
        model: processed.model,
        newEvidenceIds,
        warnings: payload.warnings || []
      },
      auditAction: 'ANALYSIS_COMPARE_SUCCESS',
      auditDetails: {
        caseId: parsedCaseId,
        evidenceIds,
        resultId: result.id
      }
    };
  } catch (error) {
    await analysisModel.updateRequestStatus(request.id, 'FAILED', error.message, userId);
    return {
      success: false,
      error: 'Error al comparar evidencias',
      details: error.message,
      requestId: request.id,
      auditAction: 'ANALYSIS_COMPARE_FAILED',
      auditDetails: { error: error.message, caseId: parsedCaseId }
    };
  }
}

module.exports = { execute };
