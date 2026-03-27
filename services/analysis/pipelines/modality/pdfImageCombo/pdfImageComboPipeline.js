// =====================================================
// SISTEMA IRIS - PDF+Image Combo Modality Pipeline
// Prepara contenido de evidencias con texto PDF e imagenes
// NO reutiliza PdfPipeline ni ImagePipeline
// =====================================================

/**
 * Prepara contenido de modalidad PDF+Image combo para envio a IA.
 * Normaliza la forma canonica (texto PDF + imagenes).
 * NO reutiliza PdfPipeline ni ImagePipeline.
 * El token management se delega a los payload builders de cada servicio.
 *
 * @param {Object} content - Contenido canonico del Document Processor
 * @param {string} content.text - Texto extraido del PDF
 * @param {Array} content.images - Imagenes [{base64, mimeType}]
 * @returns {{ text: string, images: Array, modality: string }}
 */
function prepare(content) {
  const { text = '', images = [] } = content;

  console.log(`[pdfImageComboPipeline] Preparando contenido PDF+Image: ${text.length} chars, ${images.length} imagen(es)`);

  return { text, images, modality: 'pdfImageCombo' };
}

module.exports = { prepare };
