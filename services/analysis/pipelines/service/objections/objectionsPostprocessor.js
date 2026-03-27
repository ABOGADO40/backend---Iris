// =====================================================
// SISTEMA IRIS - Objections Postprocessor
// Extrae datos estructurados de la respuesta de objeciones
// =====================================================

const { DISCLAIMER } = require('../../../shared/constants');

/**
 * Postprocesa la respuesta de la IA para objeciones
 * @param {string} content - Texto crudo de la respuesta IA
 * @param {string} provider - Proveedor usado
 * @param {string} model - Modelo usado
 * @returns {Object} { objections, structuredObjections, disclaimer, provider, model }
 */
function process(content, provider, model) {
  // Extraer JSON estructurado si existe
  let structuredObjections = null;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      structuredObjections = JSON.parse(jsonMatch[1]);
    } catch (e) {
      // JSON invalido, ignorar
    }
  }

  return {
    objections: content,
    structuredObjections,
    disclaimer: DISCLAIMER,
    provider,
    model
  };
}

module.exports = { process };
