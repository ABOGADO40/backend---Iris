// =====================================================
// SISTEMA IRIS - Translate Orchestrator
// Orquesta el pipeline completo de traduccion pericial
// Evidencia unica (excluyente): N evidencias → N llamadas IA
// =====================================================

const prisma = require('../../../../../config/prisma');
const analysisModel = require('../../../../../models/analysisModel');
const translatePayloadBuilder = require('./translatePayloadBuilder');
const translateAIClient = require('./translateAIClient');
const translatePostprocessor = require('./translatePostprocessor');
const { buildDebugReport } = require('./translateDebug');
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
 * Imprime el log estructurado consolidado de una llamada TRANSLATE.
 */
function printStructuredLog(ev, payload, aiResult) {
  const { internalVars, config, hasImages, inputFiles, inputImages } = payload;
  const meta = aiResult?.metadata || {};

  // Derivar endpoint
  const chatApiUrl = config.apiUrl || 'https://api.openai.com/v1/chat/completions';
  const endpoint = meta.endpoint || chatApiUrl.replace(/\/chat\/completions\/?$/, '/responses');

  // Modelo efectivo
  const modelo = aiResult?.model || meta.model || config.aiModel || 'desconocido';

  // System: stored prompt reference
  const systemFinal = `Stored Prompt ID: ${config.promptId || 'NO CONFIGURADO'}` +
    (config.promptVersion ? `, Version: ${config.promptVersion}` : ', Version: current (latest)');

  // User: body.input description
  const bodyInputParts = [];
  if (inputFiles && inputFiles.length > 0) {
    bodyInputParts.push(`${inputFiles.length} archivo(s): [${inputFiles.map(f => f.marker).join(', ')}]`);
  }
  if (inputImages && inputImages.length > 0) {
    bodyInputParts.push(`${inputImages.length} imagen(es): [${inputImages.map(i => i.marker).join(', ')}]`);
  }
  const userFinal = bodyInputParts.length > 0
    ? `body.input con ${bodyInputParts.join(' + ')}`
    : 'N/A (solo variables de stored prompt, sin body.input)';

  // Variables internas (5 variables)
  const varsBlock = Object.entries(internalVars || {}).map(([k, v]) => {
    const display = truncForLog(String(v), 500);
    return `  ${k}: ${display}`;
  }).join('\n');

  // Respuesta
  const respuesta = aiResult?.success
    ? truncForLog(aiResult.content, 2000)
    : `[ERROR] ${aiResult?.error || 'Sin respuesta'}`;

  // Contenido adjunto real (archivos + imagenes)
  let adjuntosReales;
  const inputFileCount = inputFiles ? inputFiles.length : 0;
  const inputImageCount = inputImages ? inputImages.length : 0;
  if (inputFileCount > 0 || inputImageCount > 0) {
    const parts = [];
    if (inputFileCount > 0) parts.push(`${inputFileCount} archivo(s) via body.input: [${inputFiles.map(f => f.marker).join(', ')}]`);
    if (inputImageCount > 0) parts.push(`${inputImageCount} imagen(es) via body.input: [${inputImages.map(i => `${i.marker}(${i.mimeType})`).join(', ')}]`);
    adjuntosReales = `SI - ${parts.join(' + ')}`;
  } else {
    adjuntosReales = 'NO - Sin adjuntos enviados';
  }

  // Tipo de documento (modality)
  const tipoDocumento = ev.modality || 'desconocido';

  const log = `
${'='.repeat(70)}
[TRANSLATE LOG] Evidencia: "${ev.title}"
${'='.repeat(70)}

MODELO: ${modelo}
ENDPOINT: ${endpoint}

SYSTEM FINAL:
${systemFinal}

USER FINAL:
${userFinal}

VARIABLES (5):
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

¿SE ENVIARON ADJUNTOS REALES?: ${adjuntosReales}

TIPO DE DOCUMENTO: ${tipoDocumento}
${'='.repeat(70)}`;

  console.log(log);
}

/**
 * Ejecuta el pipeline completo de traduccion
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
    caseDescLocalPath,
    newEvidenceIds,
    _debug
  } = normalizedRequest;

  const isDryRun = _debug && _debug.dryRun;
  const isSendToo = _debug && _debug.sendToo;
  const isDebug = isDryRun || isSendToo;

  // Separar evidencias validas de las que fallaron en procesamiento
  const validEvidences = [];
  const processingErrors = [];

  for (const ev of allEvidences) {
    const hasContent = ev.content && ev.content.trim().length > 0;
    const hasImages = ev.images && ev.images.length > 0;

    if (hasContent || hasImages) {
      // Incluir warnings de renderizado si existen
      if (ev.renderWarning) {
        processingErrors.push({
          title: ev.title,
          error: ev.renderWarning,
          isWarning: true
        });
      }
      validEvidences.push(ev);
    } else if (ev.processingError) {
      // Evidencia que fallo en procesamiento (audio/video sin transcripcion, archivo corrupto, etc.)
      processingErrors.push({
        title: ev.title,
        error: ev.processingError,
        isWarning: false
      });
    } else {
      // Evidencia sin contenido y sin error explicito
      processingErrors.push({
        title: ev.title,
        error: `No se pudo extraer contenido del archivo "${ev.title}". ${ev.isAudioVideo ? 'La transcripcion del audio/video fallo.' : 'El archivo no tiene texto ni imagenes extraibles.'}`,
        isWarning: false
      });
    }
  }

  if (validEvidences.length === 0) {
    const errorDetails = processingErrors.length > 0
      ? processingErrors.map(e => e.error).join(' | ')
      : 'No hay contenido para procesar.';
    return {
      success: false,
      error: 'No se pudo procesar ninguna evidencia. ' + errorDetails,
      statusCode: 400
    };
  }

  // En modo dryRun NO crear solicitud en BD
  let request = null;
  if (!isDryRun) {
    request = await analysisModel.createRequest(userId, 'TRANSLATE', {
      caseId: parsedCaseId,
      evidenceId: evidenceIds[0] || null,
      inputFreeText: `Traduccion de ${validEvidences.length} documento(s): ${validEvidences.map(e => e.title).join(', ')}`.substring(0, 10000)
    });
    await analysisModel.updateRequestStatus(request.id, 'PROCESSING', null, userId);
  }

  // Procesar cada evidencia independientemente
  const translationResults = [];
  const errors = [];
  const diagnostics = [];
  const payloadWarnings = [];

  for (const ev of validEvidences) {
    let payload = null;
    try {
      payload = await translatePayloadBuilder.build(ev, serviceParams, caseDescription, caseDescImages || [], { caseDescLocalPath });
      if (payload.warnings?.length > 0) payloadWarnings.push(...payload.warnings);

      // Siempre construir y mostrar diagnostico en consola
      const diagnostic = buildDebugReport(ev, caseDescription, caseDescImages || [], payload, {
        serviceParams,
        caseDescLocalPath,
        caseId: parsedCaseId
      });
      diagnostics.push(diagnostic);
      console.log(`\n[DIAGNOSTICO TRANSLATE] Evidencia: "${ev.title}"`);
      console.log(JSON.stringify(diagnostic, null, 2));

      // En dryRun, NO llamar a OpenAI
      if (isDryRun) {
        console.log(`[translateOrchestrator] DRY-RUN: saltando llamada IA para "${ev.title}"`);
        continue;
      }

      const aiResult = await translateAIClient.call(payload);

      // Log estructurado consolidado
      printStructuredLog(ev, payload, aiResult);

      if (aiResult.success) {
        recordUsage({
          userId,
          serviceType: 'TRANSLATE',
          requestId: request.id,
          caseId: parsedCaseId,
          usage: aiResult.metadata?.usage,
          model: aiResult.model,
          callType: 'primary'
        });
        translationResults.push({
          title: ev.title,
          translation: aiResult.content,
          provider: aiResult.provider,
          model: aiResult.model
        });
      } else {
        errors.push({ title: ev.title, error: aiResult.error });
        console.warn(`[translateOrchestrator] Error traduciendo "${ev.title}": ${aiResult.error}`);
      }
    } catch (err) {
      // Log estructurado incluso en excepcion (payload puede estar definido si fallo en la llamada IA)
      if (payload) {
        printStructuredLog(ev, payload, { success: false, error: err.message });
      }
      errors.push({ title: ev.title, error: err.message });
      console.warn(`[translateOrchestrator] Excepcion traduciendo "${ev.title}": ${err.message}`);
    }
  }

  // --- DRY-RUN: retornar solo diagnostico, sin BD ni postproceso ---
  if (isDryRun) {
    return {
      success: true,
      _diagnostic: diagnostics
    };
  }

  // Combinar errores de procesamiento con errores de IA
  const allErrors = [...processingErrors.filter(e => !e.isWarning), ...errors];

  if (translationResults.length === 0) {
    const errorMsg = allErrors.map(e => `${e.title}: ${e.error}`).join('; ');
    await analysisModel.updateRequestStatus(request.id, 'FAILED', errorMsg, userId);
    return {
      success: false,
      error: 'Error al procesar la traduccion',
      details: errorMsg,
      requestId: request.id
    };
  }

  // Postproceso: combinar resultados (incluir warnings y errores de procesamiento)
  const processed = translatePostprocessor.process(translationResults, allErrors);

  // Guardar en BD
  await prisma.analysisRequest.update({
    where: { id: request.id },
    data: { aiProvider: processed.provider, aiModel: processed.model }
  });

  const result = await analysisModel.createResult(request.id, processed.translation, null, userId);
  await analysisModel.updateRequestStatus(request.id, 'COMPLETED', null, userId);

  const returnData = {
    success: true,
    data: {
      requestId: request.id,
      resultId: result.id,
      serviceType: 'TRANSLATE',
      translation: processed.translation,
      disclaimer: processed.disclaimer,
      provider: processed.provider,
      model: processed.model,
      newEvidenceIds,
      warnings: [
        ...processingErrors.filter(e => e.isWarning).map(e => e.error),
        ...payloadWarnings
      ]
    },
    auditAction: translationResults.length > 0 ? 'ANALYSIS_TRANSLATE_SUCCESS' : 'ANALYSIS_TRANSLATE_FAILED',
    auditDetails: {
      caseId: parsedCaseId,
      evidenceIds,
      resultId: result.id,
      filesProcessed: translationResults.length,
      filesErrored: allErrors.length
    }
  };

  // sendToo: incluir diagnostico junto con resultado real
  if (isSendToo && diagnostics.length > 0) {
    returnData._diagnostic = diagnostics;
  }

  return returnData;
}

module.exports = { execute };
