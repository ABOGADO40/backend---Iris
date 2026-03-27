// =====================================================
// SISTEMA IRIS - Recommend Postprocessor
// Extrae datos estructurados de la respuesta de recomendacion
// =====================================================

const { DISCLAIMER } = require('../../../shared/constants');

/**
 * Postprocesa la respuesta de la IA para recomendacion
 * @param {string} content - Texto crudo de la respuesta IA
 * @param {string} provider - Proveedor usado
 * @param {string} model - Modelo usado
 * @returns {Object} { recommendations, structuredRecommendations, disclaimer, provider, model }
 */
function process(content, provider, model) {
  // Extraer JSON estructurado si existe
  let structuredRecommendations = null;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      structuredRecommendations = JSON.parse(jsonMatch[1]);
    } catch (e) {
      // JSON invalido, ignorar
    }
  }

  return {
    recommendations: content,
    structuredRecommendations,
    disclaimer: DISCLAIMER,
    provider,
    model
  };
}

module.exports = { process };
