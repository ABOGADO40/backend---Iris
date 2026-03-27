// =====================================================
// SISTEMA IRIS - Objections Payload Builder
// Construye el payload para la llamada IA de objeciones
// =====================================================

const { estimateTextTokens, prepareContentForAI } = require('../../../shared/tokenManager');
const { remapVariables } = require('../../../shared/variableMapper');
const { getServiceConfig } = require('../../../shared/baseAIClient');

/**
 * Inserta marcadores de imagen en el texto y recopila las imagenes para envio separado.
 * Las imagenes se envian via body.input (no dentro de variables) para soportar
 * contenido mixto texto+imagenes sin violar la restriccion string|object de OpenAI.
 *
 * @param {string} text - Texto donde insertar los marcadores
 * @param {Array} images - [{ base64, mimeType, pageNumber, ... }]
 * @param {string} prefix - Prefijo para marcadores ('OBJ')
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
 * Construye el payload para generacion de objeciones
 * @param {Object} params - { pais, contexto_caso, objetivo, nivel_rigor, paquete_evidencias, images, imageContext, contexto_caso_general }
 * @returns {Promise<Object>} Payload listo para el AIClient
 */
async function build(params) {
  const config = await getServiceConfig('OBJECTIONS');

  if (!config) {
    throw new Error('Servicio OBJECTIONS no configurado en el sistema');
  }
  if (!config.apiKey) {
    throw new Error('API Key no configurada para el servicio OBJECTIONS');
  }
  if (!config.isActive) {
    throw new Error('El servicio OBJECTIONS esta desactivado');
  }

  const {
    pais = 'General',
    contexto_caso = 'Sin contexto adicional',
    objetivo = 'analisis',
    nivel_rigor = 'medio',
    imageContext
  } = params;

  let paquete_evidencias = params.paquete_evidencias || '';
  let images = params.images || [];
  const contexto_caso_general = params.contexto_caso_general || '';

  // Preparar contenido para no exceder context window
  const otherVarsTokens = estimateTextTokens(
    [pais, contexto_caso, objetivo, nivel_rigor, contexto_caso_general].join(' ')
  );
  const warnings = [];
  const prepared = prepareContentForAI(paquete_evidencias, images, { otherTextTokens: otherVarsTokens });
  if (prepared.truncated) warnings.push('Contenido de evidencias recortado por limite de contexto');
  if (prepared.imagesLimited) warnings.push('Se limitaron imagenes por limite de contexto');
  paquete_evidencias = prepared.text;
  images = prepared.images;

  // Transformar imagenes en marcadores + inputImages para envio via body.input
  const { text: markedText, collectedImages } = insertImageMarkers(paquete_evidencias, images, 'OBJ');
  paquete_evidencias = markedText;

  // Si hay imageContext del Orchestrator, agregarlo al texto para dar contexto a las imagenes
  if (imageContext && collectedImages.length > 0) {
    paquete_evidencias += '\n\n' + imageContext;
  }

  const hasImages = collectedImages.length > 0;

  // Logging diagnostico: trazabilidad de imagenes en payload
  console.log(`[objectionsPayloadBuilder] === PAYLOAD CONSTRUIDO ===`);
  console.log(`[objectionsPayloadBuilder] imagenes recibidas: ${(params.images || []).length}`);
  console.log(`[objectionsPayloadBuilder] imagenes despues de prepareContentForAI: ${images.length}`);
  console.log(`[objectionsPayloadBuilder] inputImages (con marcadores): ${collectedImages.length}${collectedImages.length > 0 ? ` [${collectedImages.map(i => i.marker).join(', ')}]` : ''}`);
  console.log(`[objectionsPayloadBuilder] hasImages: ${hasImages}`);
  console.log(`[objectionsPayloadBuilder] paquete_evidencias (primeros 300 chars): ${paquete_evidencias.substring(0, 300)}`);

  // Construir variables internas (6 variables)
  const internalVars = {
    pais,
    contexto_caso,
    objetivo,
    nivel_rigor,
    paquete_evidencias,
    contexto_caso_general: contexto_caso_general || ''
  };

  // Remapear variables si hay stored prompt configurado
  const variables = remapVariables(internalVars, config.promptVariables);

  return {
    variables,
    config,
    hasImages,
    inputImages: collectedImages.length > 0 ? collectedImages : null,
    warnings
  };
}

module.exports = { build };
