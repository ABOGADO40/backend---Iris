// =====================================================
// SISTEMA IRIS - Objections Orchestrator
// Orquesta el pipeline completo de generacion de objeciones
// Consolidacion: N evidencias → 1 sola llamada IA
// =====================================================

const prisma = require('../../../../../config/prisma');
const analysisModel = require('../../../../../models/analysisModel');
const objectionsPayloadBuilder = require('./objectionsPayloadBuilder');
const objectionsAIClient = require('./objectionsAIClient');
const objectionsPostprocessor = require('./objectionsPostprocessor');
const { recordUsage } = require('../../../shared/usageTracker');

/**
 * Ejecuta el pipeline completo de objeciones
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

  const finalPais = serviceParams.pais || 'General';
  const finalContexto = caseDescription || 'Sin contexto adicional';
  const finalObjetivo = serviceParams.objetivo || 'analisis';
  const finalNivelRigor = serviceParams.nivel_rigor || 'medio';

  // Construir paquete de evidencias con separacion clara por documento
  let finalPaqueteEvidencias = '';
  const allImages = [];
  const imageLabels = [];
  let imgIdx = 1;

  // Imagenes de la descripcion del caso primero
  if (caseDescImages?.length > 0) {
    const start = imgIdx;
    allImages.push(...caseDescImages);
    imgIdx += caseDescImages.length;
    imageLabels.push(caseDescImages.length === 1
      ? `Imagen ${start}: Descripcion del caso`
      : `Imagenes ${start}-${imgIdx - 1}: Descripcion del caso`);
  }

  for (const ev of allEvidences) {
    finalPaqueteEvidencias += `========================================\n`;
    finalPaqueteEvidencias += `DOCUMENTO: ${ev.title} (Tipo: ${ev.type || 'No especificado'})\n`;
    finalPaqueteEvidencias += `========================================\n`;
    const textoEvidencia = ev.content?.trim()
      ? ev.content
      : ev.images?.length > 0
        ? `Este documento es una imagen (${ev.title}). El contenido completo se encuentra en las imagenes adjuntas. Analiza visualmente las imagenes para extraer la informacion pericial.`
        : 'Sin contenido extraido';
    finalPaqueteEvidencias += `${textoEvidencia}\n\n`;
    if (ev.images?.length > 0) {
      const evNum = allEvidences.indexOf(ev) + 1;
      const start = imgIdx;
      allImages.push(...ev.images);
      imgIdx += ev.images.length;
      imageLabels.push(ev.images.length === 1
        ? `Imagen ${start}: Documento ${evNum}`
        : `Imagenes ${start}-${imgIdx - 1}: Documento ${evNum}`);
    }
  }

  // Contexto descriptivo dinamico para imagenes
  const imageContext = imageLabels.length > 0
    ? `Las siguientes imagenes contienen evidencias periciales.\n${imageLabels.join('\n')}`
    : undefined;

  // Logging diagnostico: trazabilidad de imagenes por evidencia
  console.log(`[objectionsOrchestrator] === EVIDENCIAS PROCESADAS ===`);
  console.log(`[objectionsOrchestrator] Total evidencias: ${allEvidences.length}, caseDescImages: ${(caseDescImages || []).length}`);
  for (const ev of allEvidences) {
    console.log(`[objectionsOrchestrator]   "${ev.title}": texto=${(ev.content || '').length} chars, imagenes=${(ev.images || []).length}`);
  }
  console.log(`[objectionsOrchestrator] Total imagenes recopiladas: ${allImages.length}`);
  console.log(`[objectionsOrchestrator] imageContext: ${imageContext ? 'generado' : 'no aplica'}`);

  const hasText = finalPaqueteEvidencias.trim().length > 0;
  const hasImages = allImages.length > 0;

  if (!hasText && !hasImages) {
    return {
      success: false,
      error: 'No hay contenido para generar objeciones',
      statusCode: 400
    };
  }

  // Crear solicitud en BD
  const request = await analysisModel.createRequest(userId, 'OBJECTIONS', {
    caseId: parsedCaseId,
    evidenceId: evidenceIds[0] || null,
    inputFreeText: finalPaqueteEvidencias.substring(0, 10000)
  });

  await analysisModel.updateRequestStatus(request.id, 'PROCESSING', null, userId);

  try {
    const payload = await objectionsPayloadBuilder.build({
      pais: finalPais,
      contexto_caso: finalContexto,
      objetivo: finalObjetivo,
      nivel_rigor: finalNivelRigor,
      paquete_evidencias: finalPaqueteEvidencias || '',
      images: allImages,
      imageContext,
      contexto_caso_general: finalContexto
    });

    const aiResult = await objectionsAIClient.call(payload);

    // Registrar consumo de tokens
    if (aiResult.success) {
      recordUsage({
        userId,
        serviceType: 'OBJECTIONS',
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
        error: 'Error al generar objeciones',
        details: aiResult.error,
        requestId: request.id,
        auditAction: 'ANALYSIS_OBJECTIONS_FAILED',
        auditDetails: { error: aiResult.error, caseId: parsedCaseId }
      };
    }

    // Postproceso
    const processed = objectionsPostprocessor.process(aiResult.content, aiResult.provider, aiResult.model);

    // Guardar en BD
    await prisma.analysisRequest.update({
      where: { id: request.id },
      data: { aiProvider: processed.provider, aiModel: processed.model }
    });

    const result = await analysisModel.createResult(request.id, processed.objections, processed.structuredObjections, userId);
    await analysisModel.updateRequestStatus(request.id, 'COMPLETED', null, userId);

    return {
      success: true,
      data: {
        requestId: request.id,
        resultId: result.id,
        serviceType: 'OBJECTIONS',
        objections: processed.objections,
        structuredObjections: processed.structuredObjections,
        disclaimer: processed.disclaimer,
        provider: processed.provider,
        model: processed.model,
        newEvidenceIds,
        warnings: payload.warnings || []
      },
      auditAction: 'ANALYSIS_OBJECTIONS_SUCCESS',
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
      error: 'Error al generar objeciones',
      details: error.message,
      requestId: request.id,
      auditAction: 'ANALYSIS_OBJECTIONS_FAILED',
      auditDetails: { error: error.message, caseId: parsedCaseId }
    };
  }
}

module.exports = { execute };
