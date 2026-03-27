// =====================================================
// SISTEMA IRIS - Compare AI Client (AISLADO)
// Cliente IA exclusivo para el servicio COMPARE
// No compartido con otros servicios
// =====================================================

const { callOpenAIResponsesAPI, uploadBase64ImageToOpenAI, deleteFileFromOpenAI } = require('../../../shared/baseAIClient');
const { VISION_MODEL } = require('../../../shared/constants');

/**
 * Realiza la llamada IA para comparacion de evidencias.
 *
 * Si el payload incluye inputImages, sube cada imagen a OpenAI Files API
 * y las pasa como inputImages para que baseAIClient las incluya en body.input.
 *
 * @param {Object} payload - Resultado de comparePayloadBuilder.build()
 * @returns {Promise<{success: boolean, content: string, provider: string, model: string, error?: string}>}
 */
async function call(payload) {
  const { variables, config, hasImages, inputImages } = payload;
  const uploadedFileIds = [];

  try {
    if (!config.promptId) {
      throw new Error('Prompt ID no configurado para el servicio COMPARE');
    }

    // Subir inputImages a OpenAI Files API
    let uploadedInputImages = null;
    if (inputImages && inputImages.length > 0) {
      uploadedInputImages = [];
      for (const img of inputImages) {
        try {
          const fileId = await uploadBase64ImageToOpenAI(img.base64, img.mimeType, config.apiKey);
          uploadedFileIds.push(fileId);
          uploadedInputImages.push({ fileId, marker: img.marker });
          console.log(`[compareAIClient] Imagen ${img.marker} subida como archivo: ${fileId} (${img.mimeType})`);
        } catch (imgUploadErr) {
          console.warn(`[compareAIClient] Error subiendo imagen ${img.marker}: ${imgUploadErr.message}`);
        }
      }
      if (uploadedInputImages.length === 0) uploadedInputImages = null;
    }

    const actualModel = hasImages ? VISION_MODEL : config.aiModel;

    const result = await callOpenAIResponsesAPI(
      config.promptId,
      config.promptVersion,
      variables,
      config.apiKey,
      {
        model: actualModel,
        temperature: config.temperature,
        apiUrl: config.apiUrl,
        inputImages: uploadedInputImages
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
    console.error(`[compareAIClient] ${error.message}`);
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
