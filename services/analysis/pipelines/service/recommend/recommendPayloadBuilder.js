// =====================================================
// SISTEMA IRIS - Recommend Payload Builder
// Construye el payload para la llamada IA de analisis de caso
// 24 variables: pais, objetivo, nivel_rigor, paquete_evidencia_1..20, contexto_caso_general
// =====================================================

const path = require('path');
const { estimateTextTokens, prepareContentForAI } = require('../../../shared/tokenManager');
const { MAX_INPUT_TOKENS } = require('../../../shared/constants');
const { remapVariables } = require('../../../shared/variableMapper');
const { getServiceConfig } = require('../../../shared/baseAIClient');

// Extensiones que OpenAI Files API acepta con purpose "user_data".
// Imagenes (.jpeg, .png, etc.) NO estan soportadas → usar input_image para esas.
const INPUT_FILE_SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.html', '.htm', '.json', '.xml', '.txt', '.text', '.md', '.markdown',
  '.css', '.js', '.mjs', '.py', '.java', '.c', '.h', '.sh', '.yaml', '.yml',
  '.bat', '.brf', '.cls', '.diff', '.eml', '.es', '.hs', '.ics', '.ifb',
  '.ksh', '.ltx', '.mail', '.mht', '.mhtml', '.nws', '.patch', '.pl', '.pm',
  '.pot', '.rst', '.scala', '.shtml', '.srt', '.sty', '.tex', '.vcf', '.vtt',
  '.art'
]);

/**
 * Verifica si un archivo puede subirse a OpenAI Files API (input_file).
 * Solo archivos de texto y PDFs son soportados. Imagenes NO.
 */
function canUseInputFile(filePath) {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return INPUT_FILE_SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Deriva tipo de documento y modalidad de procesamiento desde los metadatos de la evidencia.
 */
function deriveDocumentMeta(evidence) {
  let tipo = 'Documento';
  let modalidad = 'Texto';

  if (evidence.isAudioVideo) {
    tipo = 'Audio/Video transcrito';
    modalidad = 'Transcripcion automatica';
  } else if (evidence.mimeType) {
    const mime = evidence.mimeType.toLowerCase();
    if (mime.includes('pdf')) {
      tipo = 'PDF';
    } else if (mime.includes('image')) {
      tipo = 'Imagen';
    } else if (mime.includes('html')) {
      tipo = 'HTML';
    } else if (mime.includes('word') || mime.includes('docx') || mime.includes('doc')) {
      tipo = 'Documento Word';
    } else if (mime.includes('text')) {
      tipo = 'Texto plano';
    }
  }

  if (evidence.modality) {
    const mod = evidence.modality.toLowerCase();
    if (mod.includes('ocr')) {
      modalidad = 'OCR (reconocimiento optico de caracteres)';
    } else if (mod.includes('transcri')) {
      modalidad = 'Transcripcion automatica';
    } else if (mod.includes('text') || mod.includes('extract')) {
      modalidad = 'Texto extraido digitalmente';
    }
  }

  if (evidence.images && evidence.images.length > 0 && !evidence.isAudioVideo) {
    modalidad += ' + imagenes renderizadas';
  }

  return { tipo, modalidad };
}

/**
 * Inserta marcadores de imagen en el texto y recopila las imagenes para envio separado.
 * Las imagenes se envian via body.input (no dentro de variables) para soportar
 * contenido mixto texto+imagenes sin violar la restriccion string|object de OpenAI.
 *
 * @param {string} text - Texto donde insertar los marcadores
 * @param {Array} images - [{ base64, mimeType, pageNumber, ... }]
 * @param {string} prefix - Prefijo para marcadores (ej: 'EV1', 'EV2', 'CTX')
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
 * Construye el payload para analisis de caso con 20 slots de evidencia individuales.
 * Cada evidencia va en su propio paquete_evidencia_N (1-20).
 * Marcadores de imagen usan prefijo EV{N}: [EV1_IMG_1], [EV2_IMG_1], etc.
 *
 * @param {Object} params
 * @param {string} params.pais
 * @param {string} params.objetivo
 * @param {string} params.nivel_rigor
 * @param {Array<{text: string, images: Array, inputFiles: Array}>} params.evidenceSlots - Hasta 20 slots
 * @param {string} params.imageContext - Etiquetas descriptivas de imagenes (del Orchestrator)
 * @param {string} params.contexto_caso_general - Descripcion del caso
 * @param {string} params.caseDescLocalPath - Ruta local del archivo de descripcion del caso
 * @param {Array} params.caseDescImages - Imagenes del archivo de descripcion
 * @returns {Promise<Object>} Payload listo para el AIClient
 */
async function build(params) {
  const config = await getServiceConfig('RECOMMEND');

  if (!config) {
    throw new Error('Servicio RECOMMEND no configurado en el sistema');
  }
  if (!config.apiKey) {
    throw new Error('API Key no configurada para el servicio RECOMMEND');
  }
  if (!config.isActive) {
    throw new Error('El servicio RECOMMEND esta desactivado');
  }

  const {
    pais = 'General',
    objetivo = 'integral',
    nivel_rigor = 'alto',
    evidenceSlots = [],
    caseDescLocalPath,
    caseDescImages = []
  } = params;

  const contexto_caso_general_raw = params.contexto_caso_general || '';

  // Acumuladores globales (se llenan desde todos los slots)
  const allInputFiles = [];
  const allCollectedImages = [];
  const warnings = [];

  // Calcular budget de tokens por slot activo
  const fixedVarsTokens = estimateTextTokens(
    [pais, objetivo, nivel_rigor, contexto_caso_general_raw].join(' ')
  );
  const activeSlots = evidenceSlots.filter(s => s && s.text && s.text.trim().length > 0);
  const totalAvailable = MAX_INPUT_TOKENS - fixedVarsTokens;
  const perSlotBudget = Math.floor(totalAvailable / Math.max(activeSlots.length, 1));

  // Procesar cada uno de los 20 slots de evidencia
  const processedSlotTexts = [];

  for (let i = 0; i < 20; i++) {
    const slot = evidenceSlots[i];

    if (!slot || !slot.text || !slot.text.trim()) {
      // Variable vacia: se envia como string vacio a OpenAI
      processedSlotTexts.push('');
      continue;
    }

    let slotText = slot.text;
    let slotImages = slot.images ? [...slot.images] : [];

    // PATH A: archivos que se suben como input_file a body.input
    if (slot.inputFiles && slot.inputFiles.length > 0) {
      allInputFiles.push(...slot.inputFiles);
    }

    // Preparar contenido para no exceder budget por slot
    const otherTokensForSlot = MAX_INPUT_TOKENS - perSlotBudget;
    const prepared = prepareContentForAI(slotText, slotImages, { otherTextTokens: otherTokensForSlot });
    if (prepared.truncated) warnings.push(`Evidencia ${i + 1} recortada por limite de contexto`);
    if (prepared.imagesLimited) warnings.push(`Imagenes de evidencia ${i + 1} limitadas por contexto`);
    slotText = prepared.text;
    slotImages = prepared.images;

    // PATH B: insertar marcadores de imagen con prefijo EV{N} (1-indexed)
    // Cada slot tiene su propio prefijo: EV1, EV2, ..., EV20
    // Marcadores resultantes: [EV1_IMG_1], [EV1_IMG_2], [EV2_IMG_1], etc.
    if (slotImages.length > 0) {
      const { text: markedText, collectedImages } = insertImageMarkers(slotText, slotImages, `EV${i + 1}`);
      slotText = markedText;
      allCollectedImages.push(...collectedImages);
    }

    processedSlotTexts.push(slotText);
  }

  // Contexto del caso: PATH A/B dual logic (sin cambios)
  let contextoCasoGeneralText = contexto_caso_general_raw || 'Sin contexto';
  const hasCaseDescImages = caseDescImages.length > 0;
  const caseDescSupportsInputFile = canUseInputFile(caseDescLocalPath);

  if (hasCaseDescImages && caseDescLocalPath && caseDescSupportsInputFile) {
    // PATH A: PDF contexto → subir archivo completo como input_file en body.input
    allInputFiles.push({
      filePath: caseDescLocalPath,
      marker: '[ARCHIVO_CONTEXTO_CASO]'
    });
  } else if (hasCaseDescImages) {
    // PATH B: Contexto con imagenes no subibles → marcadores con prefijo CTX
    const prepCtx = prepareContentForAI(contextoCasoGeneralText, caseDescImages, { otherTextTokens: 0 });
    if (prepCtx.truncated) warnings.push('Contexto del caso recortado por limite de contexto');
    if (prepCtx.imagesLimited) warnings.push('Se limitaron imagenes del contexto por limite de contexto');
    const { text, collectedImages: ctxImages } = insertImageMarkers(prepCtx.text, prepCtx.images, 'CTX');
    contextoCasoGeneralText = text;
    allCollectedImages.push(...ctxImages);
  }

  // Agregar imageContext (descriptores de imagenes del Orchestrator) al contexto del caso
  const imageContext = params.imageContext;
  if (imageContext && allCollectedImages.length > 0) {
    contextoCasoGeneralText += '\n\n' + imageContext;
  }

  const hasImages = allCollectedImages.length > 0 || allInputFiles.length > 0;
  const hasInputFiles = allInputFiles.length > 0;

  // Log detallado del payload construido
  const activeCount = processedSlotTexts.filter(t => t !== '').length;
  console.log(`[recommendPayloadBuilder] === PAYLOAD CONSTRUIDO (24 variables) ===`);
  console.log(`[recommendPayloadBuilder] Slots activos: ${activeCount}/20`);
  console.log(`[recommendPayloadBuilder] Budget por slot: ~${perSlotBudget} tokens (total disponible: ${totalAvailable})`);
  console.log(`[recommendPayloadBuilder] PATH contexto: ${allInputFiles.some(f => f.marker.includes('CONTEXTO')) ? 'A (input_file)' : hasCaseDescImages ? 'B (markers+inputImages)' : 'solo texto'}`);
  console.log(`[recommendPayloadBuilder] inputFiles: ${allInputFiles.length} [${allInputFiles.map(f => f.marker).join(', ')}]`);
  console.log(`[recommendPayloadBuilder] inputImages: ${allCollectedImages.length}${allCollectedImages.length > 0 ? ` [${allCollectedImages.map(i => i.marker).join(', ')}]` : ''}`);
  console.log(`[recommendPayloadBuilder] hasImages: ${hasImages}`);
  console.log(`[recommendPayloadBuilder] contexto_caso_general (primeros 200 chars): ${String(contextoCasoGeneralText).substring(0, 200)}`);
  for (let i = 0; i < 20; i++) {
    const txt = processedSlotTexts[i];
    if (txt !== '') {
      console.log(`[recommendPayloadBuilder] paquete_evidencia_${i + 1} (primeros 200 chars): ${txt.substring(0, 200)}`);
    }
  }

  // Construir variables internas (24 variables)
  const internalVars = {
    pais,
    objetivo,
    nivel_rigor
  };

  for (let i = 1; i <= 20; i++) {
    internalVars[`paquete_evidencia_${i}`] = processedSlotTexts[i - 1];
  }

  internalVars.contexto_caso_general = contextoCasoGeneralText;

  // Remapear variables si hay stored prompt configurado
  const variables = remapVariables(internalVars, config.promptVariables);

  return {
    variables,
    internalVars,
    config,
    hasImages,
    inputFiles: hasInputFiles ? allInputFiles : null,
    inputImages: allCollectedImages.length > 0 ? allCollectedImages : null,
    warnings
  };
}

module.exports = { build, deriveDocumentMeta, canUseInputFile };
