// =====================================================
// SISTEMA IRIS - Image Modality Pipeline
// Prepara contenido de evidencias tipo imagen (OCR + imagenes)
// para consumo por los service pipelines
// =====================================================

/**
 * Prepara contenido de modalidad imagen para envio a IA.
 * Normaliza la forma canonica (text OCR + imagenes).
 * El token management se delega a los payload builders de cada servicio.
 *
 * @param {Object} content - Contenido canonico del Document Processor
 * @param {string} content.text - Texto OCR extraido de las imagenes
 * @param {Array} content.images - Imagenes [{base64, mimeType}]
 * @returns {{ text: string, images: Array, modality: string }}
 */
function prepare(content) {
  const { text = '', images = [] } = content;

  console.log(`[imagePipeline] Preparando contenido imagen: ${text.length} chars, ${images.length} imagen(es)`);

  return { text, images, modality: 'image' };
}

module.exports = { prepare };
