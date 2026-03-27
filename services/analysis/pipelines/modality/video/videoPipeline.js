// =====================================================
// SISTEMA IRIS - Video Modality Pipeline
// Prepara contenido de evidencias tipo video (frames + transcripcion)
// para consumo por los service pipelines
// =====================================================

/**
 * Prepara contenido de modalidad video para envio a IA.
 * Transforma audioText[] en texto y frames[] en images[].
 * NO mezcla con otros servicios.
 * El token management se delega a los payload builders de cada servicio.
 *
 * @param {Object} content - Contenido canonico del Document Processor
 * @param {string} content.text - Texto general (fallback)
 * @param {Array} [content.audioText] - Segmentos de transcripcion del audio del video
 * @param {Array} [content.frames] - Fotogramas extraidos del video [{base64, mimeType}]
 * @returns {{ text: string, images: Array, modality: string }}
 */
function prepare(content) {
  const { text = '', audioText = [], frames = [] } = content;

  // Combinar transcripcion del audio del video
  const transcription = audioText.length > 0 ? audioText.join('\n\n') : text;

  console.log(`[videoPipeline] Preparando contenido video: ${transcription.length} chars transcripcion, ${frames.length} frame(s)`);

  return { text: transcription, images: frames, modality: 'video' };
}

module.exports = { prepare };
