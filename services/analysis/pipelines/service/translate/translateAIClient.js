// =====================================================
// SISTEMA IRIS - Translate AI Client (AISLADO)
// Cliente IA exclusivo para el servicio TRANSLATE
// No compartido con otros servicios
// =====================================================

const { callOpenAIResponsesAPI, uploadFileToOpenAI, uploadBase64ImageToOpenAI, deleteFileFromOpenAI } = require('../../../shared/baseAIClient');
const { VISION_MODEL } = require('../../../shared/constants');

/**
 * Realiza la llamada IA para traduccion de una evidencia.
 *
 * Archivos (PDFs) e imagenes se envian via body.input (no reemplazan variables).
 * - inputFiles → se suben a OpenAI Files API → van como input_file en body.input
 * - inputImages → se suben a OpenAI Files API → van como input_image en body.input
 *
 * Las variables del stored prompt siempre son strings.
 *
 * @param {Object} payload - Resultado de translatePayloadBuilder.build()
 * @returns {Promise<{success: boolean, content: string, provider: string, model: string, metadata?: Object, error?: string}>}
 */
async function call(payload) {
  const { variables, config, hasImages, inputFiles, inputImages } = payload;
  const uploadedFileIds = [];

  try {
    if (!config.promptId) {
      throw new Error('Prompt ID no configurado para el servicio TRANSLATE');
    }

    // Subir archivos (PDFs, etc.) a OpenAI Files API → iran en body.input como input_file
    let uploadedInputFiles = null;
    if (inputFiles && inputFiles.length > 0) {
      uploadedInputFiles = [];
      for (const file of inputFiles) {
        try {
          const fileId = await uploadFileToOpenAI(file.filePath, config.apiKey);
          uploadedFileIds.push(fileId);
          uploadedInputFiles.push({ fileId, marker: file.marker });
          console.log(`[translateAIClient] Archivo ${file.marker} subido: ${fileId}`);
        } catch (uploadErr) {
          console.warn(`[translateAIClient] Error subiendo archivo ${file.marker}: ${uploadErr.message}`);
        }
      }
      if (uploadedInputFiles.length === 0) uploadedInputFiles = null;
    }

    // Subir inputImages a OpenAI Files API → iran en body.input como input_image
    let uploadedInputImages = null;
    if (inputImages && inputImages.length > 0) {
      uploadedInputImages = [];
      for (const img of inputImages) {
        try {
          const fileId = await uploadBase64ImageToOpenAI(img.base64, img.mimeType, config.apiKey);
          uploadedFileIds.push(fileId);
          uploadedInputImages.push({ fileId, marker: img.marker });
          console.log(`[translateAIClient] Imagen ${img.marker} subida como archivo: ${fileId} (${img.mimeType})`);
        } catch (imgUploadErr) {
          console.warn(`[translateAIClient] Error subiendo imagen ${img.marker}: ${imgUploadErr.message}`);
        }
      }
      if (uploadedInputImages.length === 0) uploadedInputImages = null;
    }

    const actualModel = hasImages ? VISION_MODEL : config.aiModel;

    // Log detallado pre-llamada
    console.log(`[translateAIClient] === PRE-LLAMADA IA ===`);
    console.log(`[translateAIClient] modelo: ${actualModel}, hasImages: ${hasImages}`);
    console.log(`[translateAIClient] promptId: ${config.promptId}, promptVersion: ${config.promptVersion || 'current'}`);
    console.log(`[translateAIClient] uploadedInputFiles: ${uploadedInputFiles ? uploadedInputFiles.map(f => `${f.marker}=${f.fileId}`).join(', ') : 'ninguno'}`);
    console.log(`[translateAIClient] uploadedInputImages: ${uploadedInputImages ? uploadedInputImages.map(i => `${i.marker}=${i.fileId}`).join(', ') : 'ninguna'}`);
    console.log(`[translateAIClient] variables enviadas: ${JSON.stringify(Object.entries(variables).map(([k, v]) => [k, typeof v === 'string' ? v.substring(0, 100) + (v.length > 100 ? '...' : '') : v]))}`);

    const result = await callOpenAIResponsesAPI(
      config.promptId,
      config.promptVersion,
      variables,
      config.apiKey,
      {
        model: actualModel,
        temperature: config.temperature,
        apiUrl: config.apiUrl,
        inputImages: uploadedInputImages,
        inputFiles: uploadedInputFiles
      }
    );

    console.log(`[translateAIClient] === RESPUESTA IA ===`);
    console.log(`[translateAIClient] success: ${result.success}`);
    if (result.success) {
      console.log(`[translateAIClient] content (primeros 300 chars): ${result.content?.substring(0, 300)}`);
    } else {
      console.log(`[translateAIClient] error: ${result.error}`);
    }

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      success: true,
      content: result.content,
      provider: 'openai',
      model: actualModel,
      metadata: result.metadata || null
    };
  } catch (error) {
    console.error(`[translateAIClient] === EXCEPCION ===`);
    console.error(`[translateAIClient] ${error.message}`);
    return {
      success: false,
      content: '',
      provider: 'openai',
      model: config.aiModel || 'unknown',
      error: error.message
    };
  } finally {
    // Limpiar archivos subidos a OpenAI (independientemente del resultado)
    for (const fileId of uploadedFileIds) {
      deleteFileFromOpenAI(fileId, config.apiKey);
    }
  }
}

module.exports = { call };
