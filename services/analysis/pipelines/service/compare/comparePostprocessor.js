// =====================================================
// SISTEMA IRIS - Compare Postprocessor
// Extrae datos estructurados de la respuesta de comparacion
// =====================================================

const { DISCLAIMER } = require('../../../shared/constants');

/**
 * Postprocesa la respuesta de la IA para comparacion
 * @param {string} content - Texto crudo de la respuesta IA
 * @param {string} provider - Proveedor usado
 * @param {string} model - Modelo usado
 * @returns {Object} { comparison, structuredComparison, disclaimer, provider, model }
 */
function process(content, provider, model) {
  // Extraer JSON estructurado si existe
  let structuredComparison = null;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      structuredComparison = JSON.parse(jsonMatch[1]);
    } catch (e) {
      // JSON invalido, ignorar
    }
  }

  return {
    comparison: content,
    structuredComparison,
    disclaimer: DISCLAIMER,
    provider,
    model
  };
}

module.exports = { process };
