// =====================================================
// SISTEMA IRIS - Audio Modality Pipeline
// Prepara contenido de evidencias tipo audio (transcripcion)
// para consumo por los service pipelines
// =====================================================

/**
 * Prepara contenido de modalidad audio para envio a IA.
 * Transforma audioText[] en texto unificado. NO mezcla con imagenes.
 * El token management se delega a los payload builders de cada servicio.
 *
 * @param {Object} content - Contenido canonico del Document Processor
 * @param {string} content.text - Texto general (fallback)
 * @param {Array} [content.audioText] - Segmentos de transcripcion de audio
 * @returns {{ text: string, images: Array, modality: string }}
 */
function prepare(content) {
  const { text = '', audioText = [] } = content;

  // Preferir audioText si esta disponible, sino usar text como fallback
  const transcription = audioText.length > 0 ? audioText.join('\n\n') : text;

  console.log(`[audioPipeline] Preparando contenido audio: ${transcription.length} chars, ${audioText.length} segmento(s) de transcripcion`);

  return { text: transcription, images: [], modality: 'audio' };
}

module.exports = { prepare };
