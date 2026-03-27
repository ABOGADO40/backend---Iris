// =====================================================
// SISTEMA IRIS - Recommend AI Client (AISLADO)
// Cliente IA exclusivo para el servicio RECOMMEND
// No compartido con otros servicios
// =====================================================

const { callOpenAIResponsesAPI, uploadFileToOpenAI, uploadBase64ImageToOpenAI, deleteFileFromOpenAI } = require('../../../shared/baseAIClient');
const { VISION_MODEL } = require('../../../shared/constants');

/**
 * Realiza la llamada IA para analisis de caso.
 *
 * Si el payload incluye inputFiles (PDFs, etc.), los sube a OpenAI Files API
 * y los pasa como inputFiles para que baseAIClient los incluya en body.input.
 *
 * Si el payload incluye inputImages, sube cada imagen a OpenAI Files API
 * y las pasa como inputImages para que baseAIClient las incluya en body.input.
 *
 * @param {Object} payload - Resultado de recommendPayloadBuilder.build()
 * @returns {Promise<{success: boolean, content: string, provider: string, model: string, metadata?: Object, error?: string}>}
 */
async function call(payload) {
  const { variables, config, hasImages, inputFiles, inputImages } = payload;
  const uploadedFileIds = [];

  try {
    if (!config.promptId) {
      throw new Error('Prompt ID no configurado para el servicio RECOMMEND');
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
          console.log(`[recommendAIClient] Archivo ${file.marker} subido: ${fileId}`);
        } catch (uploadErr) {
          console.warn(`[recommendAIClient] Error subiendo archivo ${file.marker}: ${uploadErr.message}`);
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
          console.log(`[recommendAIClient] Imagen ${img.marker} subida como archivo: ${fileId} (${img.mimeType})`);
        } catch (imgUploadErr) {
          console.warn(`[recommendAIClient] Error subiendo imagen ${img.marker}: ${imgUploadErr.message}`);
        }
      }
      if (uploadedInputImages.length === 0) uploadedInputImages = null;
    }

    const actualModel = hasImages ? VISION_MODEL : config.aiModel;

    // Log pre-llamada
    console.log(`[recommendAIClient] === PRE-LLAMADA IA ===`);
    console.log(`[recommendAIClient] modelo: ${actualModel}, hasImages: ${hasImages}`);
    console.log(`[recommendAIClient] promptId: ${config.promptId}, promptVersion: ${config.promptVersion || 'current'}`);
    console.log(`[recommendAIClient] uploadedInputFiles: ${uploadedInputFiles ? uploadedInputFiles.map(f => `${f.marker}=${f.fileId}`).join(', ') : 'ninguno'}`);
    console.log(`[recommendAIClient] uploadedInputImages: ${uploadedInputImages ? uploadedInputImages.map(i => `${i.marker}=${i.fileId}`).join(', ') : 'ninguna'}`);

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
    console.error(`[recommendAIClient] ${error.message}`);
    return {
      success: false,
      content: '',
      provider: 'openai',
      model: config.aiModel || 'unknown',
      error: error.message,
      metadata: null
    };
  } finally {
    // Limpiar archivos subidos a OpenAI (independientemente del resultado)
    for (const fileId of uploadedFileIds) {
      deleteFileFromOpenAI(fileId, config.apiKey);
    }
  }
}

module.exports = { call };
