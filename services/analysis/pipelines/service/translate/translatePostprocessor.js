// =====================================================
// SISTEMA IRIS - Translate Postprocessor
// Combina resultados de traduccion de multiples evidencias
// =====================================================

const { DISCLAIMER } = require('../../../shared/constants');

/**
 * Combina los resultados de traduccion de multiples evidencias
 * @param {Array} results - [{ title, translation, provider, model }]
 * @param {Array} errors - [{ title, error }]
 * @returns {Object} { translation, disclaimer, provider, model }
 */
function process(results, errors) {
  let finalTranslation;

  if (results.length === 1) {
    finalTranslation = results[0].translation;
  } else {
    finalTranslation = results.map(r =>
      `========================================\nDOCUMENTO: ${r.title}\n========================================\n\n${r.translation}`
    ).join('\n\n');

    if (errors.length > 0) {
      finalTranslation += `\n\n--- NOTA: ${errors.length} documento(s) no pudieron ser procesados: ${errors.map(e => e.title).join(', ')} ---`;
    }
  }

  const lastResult = results[results.length - 1];

  return {
    translation: finalTranslation,
    disclaimer: DISCLAIMER,
    provider: lastResult.provider,
    model: lastResult.model
  };
}

module.exports = { process };
