// =====================================================
// SISTEMA IRIS - Translate Debug Helper
// Construye reporte diagnostico para modo dry-run / debug
// 5 VARIABLES: pais, objetivo, nivel_rigor, paquete_evidencia, contexto_caso_general
// =====================================================

/**
 * Genera un preview corto de texto: primeros y ultimos N chars
 */
function textPreview(text, chars = 120) {
  if (!text || typeof text !== 'string') return { charCount: 0, previewStart: '', previewEnd: '' };
  const trimmed = text.trim();
  return {
    charCount: trimmed.length,
    previewStart: trimmed.substring(0, chars),
    previewEnd: trimmed.length > chars * 2 ? trimmed.substring(trimmed.length - chars) : ''
  };
}

/**
 * Resume los detalles de un array de imagenes
 */
function summarizeImages(images) {
  if (!images || !Array.isArray(images) || images.length === 0) {
    return { count: 0, details: [] };
  }
  return {
    count: images.length,
    details: images.map((img, i) => ({
      index: i,
      mimeType: img.mimeType || 'unknown',
      base64Length: img.base64 ? img.base64.length : 0,
      pageNumber: img.pageNumber || null
    }))
  };
}

/**
 * Construye el reporte diagnostico para una evidencia del pipeline TRANSLATE.
 *
 * @param {Object} evidence - Evidencia raw del normalizer {title, content, images, localFilePath, ...}
 * @param {string} caseDescription - Texto de descripcion del caso
 * @param {Array} caseDescImages - Imagenes del archivo de descripcion del caso
 * @param {Object} payload - Resultado de translatePayloadBuilder.build()
 *   { variables, internalVars, config, hasImages, inputFiles, inputImages }
 * @param {Object} options - { serviceParams, caseDescLocalPath }
 * @returns {Object} Reporte diagnostico estructurado
 */
function buildDebugReport(evidence, caseDescription, caseDescImages, payload, options = {}) {
  const { serviceParams = {}, caseDescLocalPath = null } = options;

  // --- A) SELECTION ---
  const inputFiles = payload.inputFiles || [];
  const inputImages = payload.inputImages || [];

  const selection = {
    caseId: options.caseId || null,
    evidenceId: evidence.evidenceId || null,
    fileName: evidence.title || 'desconocido',
    pipeline: 'TRANSLATE',
    decision: {
      evidencePath: inputFiles.some(f => f.marker && f.marker.includes('EVIDENCIA')) ? 'A_INPUT_FILE_BODY_INPUT' : 'B_MARKERS_INPUT_IMAGES',
      contextPath: inputFiles.some(f => f.marker && f.marker.includes('CONTEXTO')) ? 'A_INPUT_FILE_BODY_INPUT'
        : (caseDescImages && caseDescImages.length > 0) ? 'B_MARKERS_INPUT_IMAGES' : 'TEXT_ONLY'
    }
  };

  // --- B) EXTRACTION (lo que se extrajo de los archivos originales) ---
  const extraction = {
    context: {
      fileName: caseDescLocalPath ? caseDescLocalPath.split(/[/\\]/).pop() : null,
      extractedText: textPreview(caseDescription),
      extractedImages: summarizeImages(caseDescImages),
      flags: {
        hasLocalPath: !!caseDescLocalPath
      }
    },
    evidence: {
      fileName: evidence.title || null,
      mimeType: evidence.mimeType || null,
      localFilePath: evidence.localFilePath || null,
      extractedText: textPreview(evidence.content),
      extractedImages: summarizeImages(evidence.images),
      flags: {
        isAudioVideo: !!evidence.isAudioVideo,
        hasLocalPath: !!evidence.localFilePath,
        hasProcessingError: !!evidence.processingError,
        renderWarning: evidence.renderWarning || null
      }
    }
  };

  // --- C) VARIABLES (lo que se enviaria a OpenAI como stored prompt variables) ---
  const variables = {};
  if (payload.variables) {
    for (const [key, value] of Object.entries(payload.variables)) {
      if (typeof value === 'string') {
        variables[key] = textPreview(value, 150);
      } else if (value && typeof value === 'object') {
        variables[key] = {
          type: value.type || 'object',
          hasContent: true,
          keys: Object.keys(value)
        };
      } else {
        variables[key] = { type: typeof value, value: String(value) };
      }
    }
  }

  // --- D) ATTACHMENTS (archivos e imagenes que se enviarian via body.input) ---
  const ctxImages = inputImages.filter(img => img.marker && img.marker.startsWith('[CTX'));
  const evdImages = inputImages.filter(img => img.marker && img.marker.startsWith('[EVD'));

  const attachments = {
    totalInputFiles: inputFiles.length,
    totalInputImages: inputImages.length,
    ctxImagesAttached: ctxImages.length,
    evdImagesAttached: evdImages.length,
    inputFileLabels: inputFiles.map(f => f.marker),
    inputImageLabels: inputImages.map(img => img.marker),
    noBase64InTextConfirmation: !Object.values(payload.variables || {}).some(v =>
      typeof v === 'string' && v.includes('data:image/')
    )
  };

  // --- E) CONFIG (metadata de configuracion del servicio) ---
  const configSummary = {
    provider: payload.config?.provider || null,
    model: payload.config?.model || null,
    hasStoredPrompt: !!payload.config?.promptId,
    promptId: payload.config?.promptId || null,
    serviceParams
  };

  return {
    selection,
    extraction,
    variables,
    attachments,
    config: configSummary
  };
}

module.exports = { buildDebugReport };
