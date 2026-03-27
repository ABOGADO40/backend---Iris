// =====================================================
// SISTEMA IRIS - Audio+Image Combo Modality Pipeline
// Prepara contenido de evidencias con audio transcrito e imagenes
// NO reutiliza AudioPipeline ni ImagePipeline
// =====================================================

/**
 * Prepara contenido de modalidad Audio+Image combo para envio a IA.
 * Transforma audioText[] en texto unificado e incluye imagenes.
 * NO reutiliza AudioPipeline ni ImagePipeline.
 * El token management se delega a los payload builders de cada servicio.
 *
 * @param {Object} content - Contenido canonico del Document Processor
 * @param {string} content.text - Texto general (fallback si no hay audioText)
 * @param {Array} content.images - Imagenes [{base64, mimeType}]
 * @param {Array} [content.audioText] - Segmentos de transcripcion de audio
 * @returns {{ text: string, images: Array, modality: string }}
 */
function prepare(content) {
  const { text = '', images = [], audioText = [] } = content;

  // Combinar transcripcion de audio
  const transcription = audioText.length > 0 ? audioText.join('\n\n') : text;

  console.log(`[audioImageComboPipeline] Preparando contenido Audio+Image: ${transcription.length} chars transcripcion, ${images.length} imagen(es)`);

  return { text: transcription, images, modality: 'audioImageCombo' };
}

module.exports = { prepare };
