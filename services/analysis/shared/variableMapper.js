// =====================================================
// SISTEMA IRIS - Variable Mapper
// Mapeo dinamico de variables internas a nombres de OpenAI stored prompts
// =====================================================

/**
 * Remapea nombres de variables internas a los nombres configurados para OpenAI.
 * Si no hay mapeo configurado, usa los nombres internos tal cual.
 * Solo envia variables que tienen mapeo registrado en la BD.
 * Variables sin mapeo NO se envian: OpenAI Responses API rechaza
 * variables desconocidas en stored prompts ("Unknown prompt variables").
 *
 * @param {Object} internalVars - Variables con nombres internos fijos
 * @param {Object} configuredMapping - Mapeo {internalKey: promptVarName} de la BD
 * @returns {Object} Variables remapeadas para OpenAI
 */
function remapVariables(internalVars, configuredMapping) {
  if (!configuredMapping || typeof configuredMapping !== 'object') {
    return internalVars;
  }
  const remapped = {};
  for (const [internalKey, value] of Object.entries(internalVars)) {
    if (internalKey in configuredMapping) {
      remapped[configuredMapping[internalKey]] = value;
    }
  }
  return remapped;
}

module.exports = {
  remapVariables
};
