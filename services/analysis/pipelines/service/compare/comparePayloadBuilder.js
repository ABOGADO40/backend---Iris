// =====================================================
// SISTEMA IRIS - Compare Payload Builder
// Construye el payload para la llamada IA de comparacion
// 6 variables consolidadas - Token budget dividido /2 por paquete
// =====================================================

const { estimateTextTokens } = require('../../../shared/tokenManager');
const { remapVariables } = require('../../../shared/variableMapper');
const { getServiceConfig } = require('../../../shared/baseAIClient');
const { TOKEN_LIMITS, MAX_INPUT_TOKENS } = require('../../../shared/constants');

/**
 * Inserta marcadores de imagen en el texto y recopila las imagenes para envio separado.
 * Las imagenes se envian via body.input (no dentro de variables) para soportar
 * contenido mixto texto+imagenes sin violar la restriccion string|object de OpenAI.
 *
 * @param {string} text - Texto donde insertar los marcadores
 * @param {Array} images - [{ base64, mimeType, pageNumber, ... }]
 * @param {string} prefix - Prefijo para marcadores ('CMP')
 * @returns {{ text: string, collectedImages: Array<{base64, mimeType, marker}> }}
 */
function insertImageMarkers(text, images, prefix) {
  if (!images || images.length === 0) {
    return { text: text || '', collectedImages: [] };
  }

  const collectedImages = [];
  const markerLabels = [];

  for (let i = 0; i < images.length; i++) {
    const marker = `[${prefix}_IMG_${i + 1}]`;
    collectedImages.push({ base64: images[i].base64, mimeType: images[i].mimeType, marker });
    markerLabels.push(marker);
  }

  const hasText = text && text.trim().length > 0;
  const markerBlock = markerLabels.join(', ');

  let resultText;
  if (hasText) {
    resultText = text + `\n\n[Imagenes adjuntas: ${markerBlock}]`;
  } else {
    resultText = `[Contenido visual: ${markerBlock}]`;
  }

  return { text: resultText, collectedImages };
}

/**
 * Construye el payload para comparacion de 2 evidencias (6 variables)
 * @param {Object} params - pais, objetivo, nivelRigor, paquete_evidencia_1, paquete_evidencia_2, contexto_caso_general, images, imageContext
 * @returns {Promise<Object>} Payload listo para el AIClient
 */
async function build(params) {
  const config = await getServiceConfig('COMPARE');

  if (!config) {
    throw new Error('Servicio COMPARE no configurado en el sistema');
  }
  if (!config.apiKey) {
    throw new Error('API Key no configurada para el servicio COMPARE');
  }
  if (!config.isActive) {
    throw new Error('El servicio COMPARE esta desactivado');
  }

  let {
    pais = 'General',
    objetivo = 'Comparacion integral',
    nivelRigor = 'Intermedio',
    paquete_evidencia_1 = '',
    paquete_evidencia_2 = '',
    contexto_caso_general = '',
    imageContext
  } = params;

  let images = params.images || [];
  const warnings = [];

  // Limitar imagenes si exceden el 40% del budget
  let imgTokens = images.length * TOKEN_LIMITS.TOKENS_PER_IMAGE;
  if (imgTokens > MAX_INPUT_TOKENS * 0.4 && images.length > 1) {
    const maxImgs = Math.max(1, Math.floor((MAX_INPUT_TOKENS * 0.4) / TOKEN_LIMITS.TOKENS_PER_IMAGE));
    if (maxImgs < images.length) {
      console.log(`[comparePayloadBuilder] Imagenes limitadas: ${images.length} → ${maxImgs}`);
      warnings.push('Se limitaron imagenes por limite de contexto');
      images = images.slice(0, maxImgs);
      imgTokens = images.length * TOKEN_LIMITS.TOKENS_PER_IMAGE;
    }
  }

  // Transformar imagenes en marcadores + inputImages para envio via body.input
  // Usar imageContext del Orchestrator como base (mapea imagenes a evidencias)
  const { text: markerText, collectedImages } = insertImageMarkers(imageContext || '', images, 'CMP');
  if (collectedImages.length > 0) {
    contexto_caso_general = (contexto_caso_general || '') + '\n\n' + markerText;
  }

  const hasImages = collectedImages.length > 0;

  // Logging diagnostico
  console.log(`[comparePayloadBuilder] === PAYLOAD CONSTRUIDO ===`);
  console.log(`[comparePayloadBuilder] imagenes recibidas: ${(params.images || []).length}`);
  console.log(`[comparePayloadBuilder] imagenes despues de limitacion: ${images.length}`);
  console.log(`[comparePayloadBuilder] inputImages (con marcadores): ${collectedImages.length}${collectedImages.length > 0 ? ` [${collectedImages.map(i => i.marker).join(', ')}]` : ''}`);
  console.log(`[comparePayloadBuilder] hasImages: ${hasImages}`);

  // Token budget: descontar variables fijas, luego dividir /2 para los paquetes
  const fixedVarsTokens = estimateTextTokens(
    [pais, objetivo, nivelRigor, contexto_caso_general].join(' ')
  );
  const textBudget = MAX_INPUT_TOKENS - fixedVarsTokens - imgTokens;
  const maxCharsPerPaquete = Math.floor((textBudget / 2) * TOKEN_LIMITS.CHARS_PER_TOKEN);

  if (paquete_evidencia_1 && paquete_evidencia_1.length > maxCharsPerPaquete) {
    console.log(`[comparePayloadBuilder] Paquete 1 truncado: ${paquete_evidencia_1.length} → ${maxCharsPerPaquete} chars`);
    warnings.push('Evidencia A recortada por limite de contexto');
    paquete_evidencia_1 = paquete_evidencia_1.substring(0, maxCharsPerPaquete) + '\n[... contenido truncado por limite de contexto ...]';
  }
  if (paquete_evidencia_2 && paquete_evidencia_2.length > maxCharsPerPaquete) {
    console.log(`[comparePayloadBuilder] Paquete 2 truncado: ${paquete_evidencia_2.length} → ${maxCharsPerPaquete} chars`);
    warnings.push('Evidencia B recortada por limite de contexto');
    paquete_evidencia_2 = paquete_evidencia_2.substring(0, maxCharsPerPaquete) + '\n[... contenido truncado por limite de contexto ...]';
  }

  // Construir variables internas (6 variables)
  const internalVars = {
    pais,
    objetivo,
    nivel_rigor: nivelRigor,
    paquete_evidencia_1,
    paquete_evidencia_2,
    contexto_caso_general: contexto_caso_general || ''
  };

  // Remapear variables si hay stored prompt configurado
  const variables = remapVariables(internalVars, config.promptVariables);

  return {
    variables,
    internalVars,
    config,
    hasImages,
    inputImages: collectedImages.length > 0 ? collectedImages : null,
    warnings
  };
}

module.exports = { build };
