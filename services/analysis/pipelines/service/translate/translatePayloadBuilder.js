// =====================================================
// SISTEMA IRIS - Translate Payload Builder
// Construye el payload para la llamada IA de traduccion
// 5 VARIABLES: pais, objetivo, nivel_rigor, paquete_evidencia, contexto_caso_general
// =====================================================

const path = require('path');
const { estimateTextTokens, prepareContentForAI } = require('../../../shared/tokenManager');
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
 * Inserta marcadores de imagen en el texto y recopila las imagenes para envio separado.
 * Las imagenes se envian via body.input (no dentro de variables) para soportar
 * contenido mixto texto+imagenes sin violar la restriccion string|object de OpenAI.
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
    resultText = text + `\n\n[Imagenes adjuntas al mensaje: ${markerBlock}]`;
  } else {
    resultText = `[Contenido visual adjunto: ${markerBlock}]`;
  }

  return { text: resultText, collectedImages };
}

/**
 * Deriva tipo de documento y modalidad de procesamiento desde los metadatos de la evidencia.
 * Esto reemplaza la seleccion manual de tipoArchivo por el usuario.
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

  // Refinar modalidad desde la info de procesamiento
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
 * Construye paquete_evidencia: string consolidado con header de metadata + contenido.
 * Reemplaza las variables individuales: nombre_archivo, tipo_archivo, texto_documento.
 */
function buildPaqueteEvidencia(evidence, textoDocumento, docMeta) {
  const sep = '='.repeat(50);
  const header = [
    sep,
    `ARCHIVO: ${evidence.title || 'documento'}`,
    `TIPO: ${docMeta.tipo}`,
    `MODALIDAD: ${docMeta.modalidad}`,
    sep
  ].join('\n');

  return `${header}\n\n${textoDocumento}`;
}

/**
 * Construye el payload para una evidencia individual de traduccion.
 *
 * Variables generadas: pais, objetivo, nivel_rigor, paquete_evidencia, contexto_caso_general
 *
 * Estrategia por tipo de archivo:
 * - PDF con imagenes → input_file en body.input (OpenAI lee texto + imagenes nativamente)
 * - Imagen sola (.jpeg, .png) → input_image en body.input (base64)
 * - Archivo de texto / sin imagenes → string con token management
 *
 * @param {Object} evidence - { title, content, images, localFilePath, mimeType, isAudioVideo, modality, ... }
 * @param {Object} serviceParams - { pais, objetivo, nivelRigor }
 * @param {string} caseDescription - Descripcion del caso (texto)
 * @param {Array} caseDescImages - Imagenes del archivo de descripcion del caso
 * @param {Object} options - { caseDescLocalPath }
 * @returns {Promise<{variables: Object, internalVars: Object, config: Object, hasImages: boolean, inputFiles: Array|null, inputImages: Array|null}>}
 */
async function build(evidence, serviceParams, caseDescription, caseDescImages = [], options = {}) {
  const config = await getServiceConfig('TRANSLATE');

  if (!config) {
    throw new Error('Servicio TRANSLATE no configurado en el sistema');
  }
  if (!config.apiKey) {
    throw new Error('API Key no configurada para el servicio TRANSLATE');
  }
  if (!config.isActive) {
    throw new Error('El servicio TRANSLATE esta desactivado');
  }

  const {
    pais = 'General',
    objetivo = 'Traducir y explicar el documento en lenguaje claro',
    nivelRigor = 'intermedio'
  } = serviceParams;

  let textoDocumento = evidence.content || '';
  const evidenceImages = evidence.images || [];
  const docMeta = deriveDocumentMeta(evidence);

  // Audio/video: sanitizar el header del texto para no exponer extensiones de audio
  if (evidence.isAudioVideo) {
    textoDocumento = textoDocumento.replace(
      /^(\[TRANSCRIPCION DE AUDIO\]\n)Archivo: .+\n/,
      `$1Archivo: ${evidence.title || 'audio transcrito'}\n`
    );
  }

  // inputFiles: archivos (PDFs, etc.) que se suben a OpenAI y van en body.input como input_file
  const inputFiles = [];
  // inputImages: imagenes que se suben a OpenAI y van en body.input como input_image
  const inputImages = [];

  const hasEvidenceImages = evidenceImages.length > 0;
  const hasCaseDescImages = caseDescImages.length > 0;

  const evidenceSupportsInputFile = canUseInputFile(evidence.localFilePath);
  const caseDescSupportsInputFile = canUseInputFile(options.caseDescLocalPath);

  // Calcular tokens de otras variables (comun a todos los paths)
  const otherVarsTokens = estimateTextTokens(
    [pais, objetivo, nivelRigor].join(' ')
  );

  const warnings = [];

  if (hasEvidenceImages && evidence.localFilePath && evidenceSupportsInputFile) {
    // PATH A: Archivo soportado con imagenes → subir como input_file a body.input
    inputFiles.push({
      filePath: evidence.localFilePath,
      marker: `[ARCHIVO_EVIDENCIA: ${evidence.title || 'documento'}]`
    });
    // texto_documento = solo el texto extraido con token management (backup textual)
    const prepared = prepareContentForAI(textoDocumento, [], { otherTextTokens: otherVarsTokens });
    if (prepared.truncated) warnings.push('Contenido de evidencia recortado por limite de contexto');
    textoDocumento = prepared.text;
  } else {
    // PATH B: Token management + marcadores de imagen (o solo texto si no hay imagenes)
    const prepared = prepareContentForAI(textoDocumento, evidenceImages, { otherTextTokens: otherVarsTokens });
    if (prepared.truncated) warnings.push('Contenido de evidencia recortado por limite de contexto');
    if (prepared.imagesLimited) warnings.push('Se limitaron imagenes de evidencia por limite de contexto');
    const { text, collectedImages } = insertImageMarkers(prepared.text, prepared.images, 'EVD');
    textoDocumento = text;
    inputImages.push(...collectedImages);
  }

  // Construir paquete_evidencia con metadata + contenido
  const paqueteEvidencia = buildPaqueteEvidencia(evidence, textoDocumento, docMeta);

  // Contexto del caso: misma logica dual PATH A/B
  let contextoCasoGeneralText = caseDescription || 'Sin contexto';
  if (hasCaseDescImages && options.caseDescLocalPath && caseDescSupportsInputFile) {
    // PATH A: PDF contexto → subir archivo completo a body.input
    inputFiles.push({
      filePath: options.caseDescLocalPath,
      marker: '[ARCHIVO_CONTEXTO_CASO]'
    });
  } else if (hasCaseDescImages) {
    // PATH B: Contexto con imagenes no subibles → marcadores
    const prepared = prepareContentForAI(contextoCasoGeneralText, caseDescImages, { otherTextTokens: 0 });
    if (prepared.truncated) warnings.push('Contexto del caso recortado por limite de contexto');
    if (prepared.imagesLimited) warnings.push('Se limitaron imagenes del contexto por limite de contexto');
    const { text, collectedImages } = insertImageMarkers(prepared.text, prepared.images, 'CTX');
    contextoCasoGeneralText = text;
    inputImages.push(...collectedImages);
  }

  const hasImages = hasEvidenceImages || hasCaseDescImages;
  const hasInputFiles = inputFiles.length > 0;

  // Guard: si hay imagenes esperadas pero ninguna llego al payload, advertir
  if (hasImages && inputImages.length === 0 && !hasInputFiles) {
    console.warn(`[translatePayloadBuilder] Se detectaron imagenes pero ninguna llego al payload (evidenceImages: ${evidenceImages.length}, caseDescImages: ${caseDescImages.length})`);
  }

  // Log detallado del payload construido
  console.log(`[translatePayloadBuilder] === PAYLOAD CONSTRUIDO ===`);
  console.log(`[translatePayloadBuilder] PATH evidencia: ${inputFiles.some(f => f.marker.includes('EVIDENCIA')) ? 'A (input_file via body.input)' : hasEvidenceImages ? 'B (markers+inputImages)' : 'solo texto'}`);
  console.log(`[translatePayloadBuilder] PATH contexto: ${inputFiles.some(f => f.marker.includes('CONTEXTO')) ? 'A (input_file via body.input)' : hasCaseDescImages ? 'B (markers+inputImages)' : 'solo texto'}`);
  console.log(`[translatePayloadBuilder] inputFiles: ${inputFiles.length} [${inputFiles.map(f => f.marker).join(', ')}]`);
  console.log(`[translatePayloadBuilder] inputImages: ${inputImages.length} [${inputImages.map(i => i.marker).join(', ')}]`);
  console.log(`[translatePayloadBuilder] paquete_evidencia (primeros 300 chars): ${paqueteEvidencia.substring(0, 300)}`);
  console.log(`[translatePayloadBuilder] contexto_caso_general (primeros 200 chars): ${String(contextoCasoGeneralText).substring(0, 200)}`);
  console.log(`[translatePayloadBuilder] hasImages: ${hasImages}`);
  inputImages.forEach((img, i) => {
    console.log(`[translatePayloadBuilder] inputImage[${i}]: marker=${img.marker}, mimeType=${img.mimeType}, base64Length=${img.base64?.length || 0}`);
  });

  const internalVars = {
    pais,
    objetivo,
    nivel_rigor: nivelRigor,
    paquete_evidencia: paqueteEvidencia,
    contexto_caso_general: contextoCasoGeneralText
  };

  // Remapear variables si hay stored prompt configurado
  const variables = remapVariables(internalVars, config.promptVariables);

  return {
    variables,
    internalVars,
    config,
    hasImages,
    inputFiles: hasInputFiles ? inputFiles : null,
    inputImages: inputImages.length > 0 ? inputImages : null,
    warnings
  };
}

module.exports = { build };
