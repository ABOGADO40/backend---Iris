// =====================================================
// SISTEMA IRIS - Content Router (Router Canonico)
// Routing dual: modalidad + servicio
// 1. Determina la modalidad del contenido (image, pdf, audio, video, combos)
// 2. Despacha al pipeline de servicio correspondiente
// =====================================================

// --- Service routers (lazy-load) ---
const serviceRouters = {
  TRANSLATE: () => require('./pipelines/service/translate/translateOrchestrator'),
  RECOMMEND: () => require('./pipelines/service/recommend/recommendOrchestrator'),
  COMPARE: () => require('./pipelines/service/compare/compareOrchestrator'),
  OBJECTIONS: () => require('./pipelines/service/objections/objectionsOrchestrator')
};

// --- Modality pipelines (lazy-load) ---
const modalityPipelines = {
  image: () => require('./pipelines/modality/image/imagePipeline'),
  pdf: () => require('./pipelines/modality/pdf/pdfPipeline'),
  audio: () => require('./pipelines/modality/audio/audioPipeline'),
  video: () => require('./pipelines/modality/video/videoPipeline'),
  pdfImageCombo: () => require('./pipelines/modality/pdfImageCombo/pdfImageComboPipeline'),
  audioImageCombo: () => require('./pipelines/modality/audioImageCombo/audioImageComboPipeline'),
  text: () => ({ prepare: (content) => ({ text: content.text || '', images: [], modality: 'text' }) })
};

/**
 * Determina la modalidad de una evidencia basado en su contenido canonico
 * @param {Object} evidence - Evidencia con campos { content, images, audioText, frames, meta }
 * @returns {string} Modalidad: 'image' | 'pdf' | 'audio' | 'video' | 'pdfImageCombo' | 'audioImageCombo' | 'text'
 */
function detectModality(evidence) {
  const hasText = evidence.content && evidence.content.trim().length > 0;
  const hasImages = evidence.images && evidence.images.length > 0;
  const hasAudioText = evidence.audioText && evidence.audioText.length > 0;
  const hasFrames = evidence.frames && evidence.frames.length > 0;
  const isAudioVideo = evidence.isAudioVideo || false;

  // Video: tiene frames (con o sin transcripcion)
  if (hasFrames) {
    return 'video';
  }

  // Audio + imagenes: transcripcion de audio junto con imagenes
  if (hasAudioText && hasImages) {
    return 'audioImageCombo';
  }

  // Audio puro: solo transcripcion, sin imagenes
  if (hasAudioText || isAudioVideo) {
    return 'audio';
  }

  // PDF + imagenes: texto extraido de PDF con imagenes embebidas
  if (hasText && hasImages) {
    return 'pdfImageCombo';
  }

  // Imagenes puras: sin texto significativo, solo imagenes (OCR)
  if (hasImages && !hasText) {
    return 'image';
  }

  // PDF/documento con solo texto
  if (hasText && !hasImages) {
    return 'pdf';
  }

  // Fallback: texto plano
  return 'text';
}

/**
 * Obtiene el pipeline de modalidad para una evidencia
 * @param {string} modality - Modalidad detectada
 * @returns {Object|null} Pipeline de modalidad con metodo prepare()
 */
function getModalityPipeline(modality) {
  const getter = modalityPipelines[modality];
  return getter ? getter() : null;
}

/**
 * Enruta la peticion normalizada al orchestrator del servicio correspondiente
 * Adjunta informacion de modalidad para que los orchestrators puedan usarla
 * @param {Object} normalizedRequest - Objeto retornado por requestNormalizer.normalize()
 * @returns {Promise<{success: boolean, data?: Object, error?: string, details?: string}>}
 */
async function route(normalizedRequest) {
  const { serviceType, allEvidences } = normalizedRequest;

  const getOrchestrator = serviceRouters[serviceType];
  if (!getOrchestrator) {
    return {
      success: false,
      error: `Tipo de servicio no soportado: ${serviceType}`
    };
  }

  // Detectar modalidad de cada evidencia, preparar contenido via modality pipeline
  if (allEvidences && allEvidences.length > 0) {
    for (const evidence of allEvidences) {
      evidence.modality = detectModality(evidence);
      const modalityPipeline = getModalityPipeline(evidence.modality);

      // Invocar modality pipeline para preparar contenido canonico para IA
      if (modalityPipeline) {
        const prepared = modalityPipeline.prepare({
          text: evidence.content || '',
          images: evidence.images || [],
          audioText: evidence.audioText || [],
          frames: evidence.frames || [],
          meta: evidence.meta || {}
        });
        // Actualizar evidencia con contenido preparado por el pipeline de modalidad
        evidence.content = prepared.text;
        evidence.images = prepared.images;
      }
    }
  }

  const orchestrator = getOrchestrator();
  return orchestrator.execute(normalizedRequest);
}

module.exports = { route };
