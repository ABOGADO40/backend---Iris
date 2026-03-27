// =====================================================
// SISTEMA IRIS - Recommend Orchestrator
// Orquesta el pipeline completo de analisis de caso
// N evidencias → hasta 20 slots individuales (paquete_evidencia_1..20)
// 24 variables: pais, objetivo, nivel_rigor, paquete_evidencia_1..20, contexto_caso_general
// =====================================================

const prisma = require('../../../../../config/prisma');
const analysisModel = require('../../../../../models/analysisModel');
const recommendPayloadBuilder = require('./recommendPayloadBuilder');
const recommendAIClient = require('./recommendAIClient');
const recommendPostprocessor = require('./recommendPostprocessor');
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
 * Imprime el log estructurado consolidado de la llamada RECOMMEND.
 */
function printStructuredLog(payload, aiResult, validEvidences, caseData, parsedCaseId) {
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

  // Variables internas (24 variables)
  // Mostrar pais/objetivo/nivel_rigor/contexto normalmente
  // Para paquetes, mostrar solo los que tienen contenido
  const varsLines = [];
  const totalVars = Object.keys(internalVars || {}).length;
  let slotsActivos = 0;
  let slotsVacios = 0;

  for (const [k, v] of Object.entries(internalVars || {})) {
    const strVal = String(v);
    if (k.startsWith('paquete_evidencia_')) {
      if (strVal.trim() === '') {
        slotsVacios++;
      } else {
        slotsActivos++;
        varsLines.push(`  ${k}: ${truncForLog(strVal, 300)}`);
      }
    } else {
      varsLines.push(`  ${k}: ${truncForLog(strVal, 500)}`);
    }
  }
  if (slotsVacios > 0) {
    varsLines.push(`  [${slotsVacios} slots vacios: ""]`);
  }

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
    if (inputImageCount > 0) parts.push(`${inputImageCount} imagen(es) via body.input: [${inputImages.map(i => `${i.marker}(${i.mimeType || ''})`).join(', ')}]`);
    adjuntosReales = `SI - ${parts.join(' + ')}`;
  } else {
    adjuntosReales = 'NO - Sin adjuntos enviados';
  }

  // Tipos de documento
  const tiposDoc = validEvidences.map(ev => {
    const docMeta = recommendPayloadBuilder.deriveDocumentMeta(ev);
    return `${ev.title}: ${docMeta.tipo} (${docMeta.modalidad})`;
  }).join(', ') || 'Sin documentos';

  const log = `
${'='.repeat(70)}
[RECOMMEND LOG] Analisis de Caso #${parsedCaseId}
${'='.repeat(70)}

MODELO: ${modelo}
ENDPOINT: ${endpoint}

SYSTEM FINAL:
${systemFinal}

USER FINAL:
${userFinal}

VARIABLES (${totalVars} total, ${slotsActivos} slots con evidencia, ${slotsVacios} slots vacios):
${varsLines.join('\n')}

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

TIPO DE DOCUMENTO: ${tiposDoc}

TIPO DE CASO: ${caseData?.type || caseData?.caseType || 'No especificado'}
${'='.repeat(70)}`;

  console.log(log);
}

/**
 * Ejecuta el pipeline completo de analisis de caso
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
    caseData,
    newEvidenceIds
  } = normalizedRequest;

  const finalPais = serviceParams.pais || 'General';
  const finalContexto = caseDescription || 'Sin contexto adicional';
  const finalObjetivo = serviceParams.objetivo || 'integral';
  const finalNivelRigor = serviceParams.nivel_rigor || 'alto';

  // --- Separar evidencias validas de las que fallaron en procesamiento ---
  const validEvidences = [];
  const processingErrors = [];

  for (const ev of allEvidences) {
    const hasContent = ev.content && ev.content.trim().length > 0;
    const hasEvImages = ev.images && ev.images.length > 0;

    if (hasContent || hasEvImages) {
      if (ev.renderWarning) {
        processingErrors.push({
          title: ev.title,
          error: ev.renderWarning,
          isWarning: true
        });
      }
      validEvidences.push(ev);
    } else if (ev.processingError) {
      processingErrors.push({
        title: ev.title,
        error: ev.processingError,
        isWarning: false
      });
    } else {
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
      : 'No hay contenido para analizar.';
    return {
      success: false,
      error: 'No se pudo procesar ninguna evidencia. ' + errorDetails,
      statusCode: 400
    };
  }

  // --- Construir slots individuales de evidencia (hasta 20) ---
  // Cada slot es { text, images, inputFiles }
  // El PayloadBuilder lo procesa y crea paquete_evidencia_1..20
  const evidenceSlots = [];
  const imageLabels = [];

  // Imagenes de la descripcion del caso primero (para etiquetas)
  if (caseDescImages?.length > 0) {
    imageLabels.push(caseDescImages.length === 1
      ? 'Imagen: Descripcion del caso'
      : `Imagenes (${caseDescImages.length}): Descripcion del caso`);
  }

  // Advertencia si hay mas de 20 evidencias
  if (validEvidences.length > 20) {
    console.warn(`[recommendOrchestrator] ADVERTENCIA: ${validEvidences.length} evidencias validas, pero solo hay 20 variables disponibles. Las evidencias 21+ seran omitidas.`);
    processingErrors.push({
      title: `Evidencias 21-${validEvidences.length}`,
      error: `Solo se pueden enviar 20 evidencias por analisis. ${validEvidences.length - 20} evidencia(s) fueron omitidas.`,
      isWarning: true
    });
  }

  const evidencesToProcess = validEvidences.slice(0, 20);
  const sep = '='.repeat(50);

  for (let i = 0; i < evidencesToProcess.length; i++) {
    const ev = evidencesToProcess[i];
    const docMeta = recommendPayloadBuilder.deriveDocumentMeta(ev);

    // Header enriquecido con ARCHIVO/TIPO/MODALIDAD
    let slotText = '';
    slotText += `${sep}\n`;
    slotText += `ARCHIVO: ${ev.title || 'documento'}\n`;
    slotText += `TIPO: ${docMeta.tipo}\n`;
    slotText += `MODALIDAD: ${docMeta.modalidad}\n`;
    slotText += `${sep}\n`;

    // Audio/video: sanitizar header del texto para no exponer extensiones de audio
    let textoEvidencia = ev.content || '';
    if (ev.isAudioVideo && textoEvidencia) {
      textoEvidencia = textoEvidencia.replace(
        /^(\[TRANSCRIPCION DE AUDIO\]\n)Archivo: .+\n/,
        `$1Archivo: ${ev.title || 'audio transcrito'}\n`
      );
    }

    const hasEvContent = textoEvidencia.trim().length > 0;
    const hasEvImages = ev.images && ev.images.length > 0;
    const evidenceSupportsInputFile = recommendPayloadBuilder.canUseInputFile(ev.localFilePath);

    const slot = { text: '', images: [], inputFiles: [] };

    if (hasEvImages && ev.localFilePath && evidenceSupportsInputFile) {
      // PATH A: archivo soportado con imagenes → subir como input_file a body.input
      slot.inputFiles.push({
        filePath: ev.localFilePath,
        marker: `[ARCHIVO_EVIDENCIA_${i + 1}: ${ev.title || 'documento'}]`
      });
      slot.text = hasEvContent
        ? slotText + textoEvidencia
        : slotText + 'Este documento se envia como archivo adjunto. Analiza el archivo completo.';
    } else {
      if (hasEvContent) {
        slot.text = slotText + textoEvidencia;
      } else if (hasEvImages) {
        slot.text = slotText + `Este documento es una imagen (${ev.title}). El contenido completo se encuentra en las imagenes adjuntas. Analiza visualmente las imagenes para extraer la informacion.`;
      } else {
        slot.text = slotText + 'Sin contenido extraido';
      }
      // Recopilar imagenes PATH B para este slot
      if (hasEvImages) {
        slot.images = [...ev.images];
        imageLabels.push(ev.images.length === 1
          ? `Imagen EV${i + 1}: paquete_evidencia_${i + 1} (${ev.title})`
          : `Imagenes EV${i + 1} (${ev.images.length}): paquete_evidencia_${i + 1} (${ev.title})`);
      }
    }

    evidenceSlots.push(slot);
  }

  // Contexto descriptivo dinamico para imagenes
  const imageContext = imageLabels.length > 0
    ? `Las siguientes imagenes contienen material probatorio del expediente.\n${imageLabels.join('\n')}`
    : undefined;

  // Logging diagnostico: trazabilidad de evidencias
  console.log(`[recommendOrchestrator] === EVIDENCIAS PROCESADAS ===`);
  console.log(`[recommendOrchestrator] Total evidencias: ${allEvidences.length}, validas: ${validEvidences.length}, procesadas: ${evidencesToProcess.length}, errores: ${processingErrors.length}`);
  console.log(`[recommendOrchestrator] caseDescImages: ${(caseDescImages || []).length}, caseDescLocalPath: ${caseDescLocalPath ? 'si' : 'no'}`);
  for (let i = 0; i < evidencesToProcess.length; i++) {
    const ev = evidencesToProcess[i];
    const slot = evidenceSlots[i];
    const docMeta = recommendPayloadBuilder.deriveDocumentMeta(ev);
    const path = slot.inputFiles.length > 0 ? 'A (input_file)' : slot.images.length > 0 ? 'B (markers)' : 'solo texto';
    console.log(`[recommendOrchestrator]   Slot ${i + 1}: "${ev.title}" texto=${slot.text.length} chars, imagenes=${slot.images.length}, inputFiles=${slot.inputFiles.length}, tipo=${docMeta.tipo}, PATH=${path}`);
  }
  if (processingErrors.length > 0) {
    for (const pe of processingErrors) {
      console.log(`[recommendOrchestrator]   [${pe.isWarning ? 'WARN' : 'ERROR'}] "${pe.title}": ${pe.error}`);
    }
  }

  // Verificar que hay al menos algun contenido
  const hasAnyContent = evidenceSlots.some(s => s.text.trim().length > 0 || s.images.length > 0 || s.inputFiles.length > 0);

  if (!hasAnyContent) {
    return {
      success: false,
      error: 'No hay contenido para analizar el caso',
      statusCode: 400
    };
  }

  // Crear solicitud en BD
  const request = await analysisModel.createRequest(userId, 'RECOMMEND', {
    caseId: parsedCaseId,
    evidenceId: evidenceIds[0] || null,
    inputFreeText: `Analisis de caso: ${evidencesToProcess.length} documento(s): ${evidencesToProcess.map(e => e.title).join(', ')}`.substring(0, 10000)
  });

  await analysisModel.updateRequestStatus(request.id, 'PROCESSING', null, userId);

  // Construir payload y llamar IA (1 sola llamada con 24 variables)
  try {
    const payload = await recommendPayloadBuilder.build({
      pais: finalPais,
      objetivo: finalObjetivo,
      nivel_rigor: finalNivelRigor,
      evidenceSlots,
      imageContext,
      contexto_caso_general: finalContexto,
      caseDescLocalPath,
      caseDescImages: caseDescImages || []
    });

    const aiResult = await recommendAIClient.call(payload);

    // Log estructurado consolidado
    printStructuredLog(payload, aiResult, validEvidences, caseData, parsedCaseId);

    // Registrar consumo de tokens
    if (aiResult.success) {
      recordUsage({
        userId,
        serviceType: 'RECOMMEND',
        requestId: request.id,
        caseId: parsedCaseId,
        usage: aiResult.metadata?.usage,
        model: aiResult.model,
        callType: 'primary'
      });
    }

    // Combinar errores de procesamiento (no-warning) con posibles errores IA
    const allErrors = processingErrors.filter(e => !e.isWarning);

    if (!aiResult.success) {
      const errorMsg = [aiResult.error, ...allErrors.map(e => `${e.title}: ${e.error}`)].join('; ');
      await analysisModel.updateRequestStatus(request.id, 'FAILED', errorMsg, userId);
      return {
        success: false,
        error: 'Error al analizar el caso',
        details: errorMsg,
        requestId: request.id,
        auditAction: 'ANALYSIS_RECOMMEND_FAILED',
        auditDetails: { error: aiResult.error, caseId: parsedCaseId }
      };
    }

    // Postproceso
    const processed = recommendPostprocessor.process(aiResult.content, aiResult.provider, aiResult.model);

    // Guardar en BD
    await prisma.analysisRequest.update({
      where: { id: request.id },
      data: { aiProvider: processed.provider, aiModel: processed.model }
    });

    const result = await analysisModel.createResult(request.id, processed.recommendations, processed.structuredRecommendations, userId);
    await analysisModel.updateRequestStatus(request.id, 'COMPLETED', null, userId);

    return {
      success: true,
      data: {
        requestId: request.id,
        resultId: result.id,
        serviceType: 'RECOMMEND',
        recommendations: processed.recommendations,
        structuredRecommendations: processed.structuredRecommendations,
        disclaimer: processed.disclaimer,
        provider: processed.provider,
        model: processed.model,
        newEvidenceIds,
        warnings: [
          ...processingErrors.filter(e => e.isWarning).map(e => e.error),
          ...(payload.warnings || [])
        ]
      },
      auditAction: 'ANALYSIS_RECOMMEND_SUCCESS',
      auditDetails: {
        caseId: parsedCaseId,
        evidenceIds,
        resultId: result.id,
        filesProcessed: evidencesToProcess.length,
        filesErrored: allErrors.length
      }
    };
  } catch (error) {
    await analysisModel.updateRequestStatus(request.id, 'FAILED', error.message, userId);
    return {
      success: false,
      error: 'Error al analizar el caso',
      details: error.message,
      requestId: request.id,
      auditAction: 'ANALYSIS_RECOMMEND_FAILED',
      auditDetails: { error: error.message, caseId: parsedCaseId }
    };
  }
}

module.exports = { execute };
