// =====================================================
// SISTEMA IRIS - PDF Modality Pipeline
// Prepara contenido de evidencias tipo PDF (texto + imagenes embebidas)
// para consumo por los service pipelines
// =====================================================

/**
 * Prepara contenido de modalidad PDF para envio a IA.
 * Normaliza la forma canonica (texto + imagenes embebidas).
 * NO mezcla con audio - eso corresponde a otra modalidad.
 * El token management se delega a los payload builders de cada servicio.
 *
 * @param {Object} content - Contenido canonico del Document Processor
 * @param {string} content.text - Texto extraido del PDF
 * @param {Array} content.images - Imagenes embebidas [{base64, mimeType}]
 * @returns {{ text: string, images: Array, modality: string }}
 */
function prepare(content) {
  const { text = '', images = [] } = content;

  console.log(`[pdfPipeline] Preparando contenido PDF: ${text.length} chars, ${images.length} imagen(es) embebida(s)`);

  return { text, images, modality: 'pdf' };
}

module.exports = { prepare };
