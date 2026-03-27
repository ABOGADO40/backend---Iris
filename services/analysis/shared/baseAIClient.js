// =====================================================
// SISTEMA IRIS - Base AI Client
// Capa HTTP generica para llamadas a OpenAI
// Los AIClients por servicio invocan estas funciones
// =====================================================

const fs = require('fs');
const path = require('path');
const aiConfigModel = require('../../../models/aiConfigModel');

// URL por defecto de la API de OpenAI
const DEFAULT_CHAT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_FILES_API_URL = 'https://api.openai.com/v1/files';

/**
 * Deriva la URL de la Responses API a partir de la URL de Chat Completions
 * Ej: 'https://api.openai.com/v1/chat/completions' -> 'https://api.openai.com/v1/responses'
 */
function deriveResponsesApiUrl(chatApiUrl) {
  if (!chatApiUrl) return DEFAULT_RESPONSES_API_URL;
  const replaced = chatApiUrl.replace(/\/chat\/completions\/?$/, '/responses');
  return replaced !== chatApiUrl ? replaced : DEFAULT_RESPONSES_API_URL;
}

// =====================================================
// CONFIGURACION DE SERVICIO
// =====================================================

/**
 * Obtiene la configuracion de un servicio IA desde la base de datos
 * @param {string} serviceType - Tipo de servicio (TRANSLATE, RECOMMEND, etc.)
 * @returns {Promise<Object|null>} Configuracion del servicio
 */
async function getServiceConfig(serviceType) {
  try {
    const config = await aiConfigModel.getConfigByServiceType(serviceType);
    if (!config) {
      console.warn(`Configuracion no encontrada para servicio: ${serviceType}`);
      return null;
    }
    return config;
  } catch (error) {
    console.error(`Error obteniendo config de ${serviceType}:`, error.message);
    return null;
  }
}

// =====================================================
// OPENAI RESPONSES API (Para prompts guardados)
// =====================================================

/**
 * Llama a la OpenAI Responses API con un prompt guardado.
 * Las variables de texto van en prompt.variables (string | input_image | input_file).
 * Las imagenes adicionales (contenido mixto) van en body.input como input_image
 * junto al stored prompt, permitiendo texto+imagenes sin violar la restriccion
 * de tipo unico por variable.
 *
 * @param {string} promptId - ID del prompt guardado en OpenAI
 * @param {string} promptVersion - Version del prompt (null = usa version activa)
 * @param {Object} variables - Variables para el prompt (pueden incluir input_image/input_file)
 * @param {string} apiKey - API Key de OpenAI
 * @param {Object} options - Opciones adicionales
 * @param {string} options.model - Modelo a usar
 * @param {number} options.maxOutputTokens - Max tokens de salida (null = default OpenAI)
 * @param {number} options.temperature - Temperatura del modelo
 * @param {string} options.apiUrl - URL base de la API (Chat Completions URL del config)
 * @param {Array} options.inputImages - Imagenes para enviar via body.input [{fileId, marker}]
 * @param {Array} options.inputFiles - Archivos para enviar via body.input [{fileId, marker}]
 * @returns {Promise<{success: boolean, content: string, error?: string}>}
 */
async function callOpenAIResponsesAPI(promptId, promptVersion, variables, apiKey, options = {}) {
  const { model = null, maxOutputTokens = null, temperature, apiUrl, inputImages, inputFiles } = options;

  try {
    const result = await _executeResponsesAPICall(promptId, promptVersion, variables, apiKey, {
      model, maxOutputTokens, temperature, apiUrl, inputImages, inputFiles
    });

    if (!result.success && result.unknownVars && result.unknownVars.length > 0) {
      // Auto-retry: eliminar variables desconocidas por el stored prompt y reintentar
      const cleanedVars = { ...variables };
      for (const varName of result.unknownVars) {
        delete cleanedVars[varName];
        console.warn(`[baseAIClient] Variable "${varName}" eliminada (no existe en stored prompt). Reintentando...`);
      }
      return await _executeResponsesAPICall(promptId, promptVersion, cleanedVars, apiKey, {
        model, maxOutputTokens, temperature, apiUrl, inputImages, inputFiles
      });
    }

    return result;
  } catch (error) {
    return {
      success: false,
      content: '',
      error: error.message
    };
  }
}

/**
 * Ejecuta la llamada HTTP a la Responses API.
 * Retorna unknownVars si OpenAI rechaza variables desconocidas.
 */
async function _executeResponsesAPICall(promptId, promptVersion, variables, apiKey, options) {
  const { model, maxOutputTokens, temperature, apiUrl, inputImages, inputFiles } = options;

  const body = {
    prompt: {
      id: promptId,
      ...(promptVersion && { version: promptVersion }),
      variables: variables
    }
  };

  // Construir body.input con archivos (input_file) e imagenes (input_image).
  // Cada item se etiqueta con su marcador para que el modelo asocie
  // los contenidos adjuntos con las referencias en el texto de las variables.
  const hasInputFiles = inputFiles && inputFiles.length > 0;
  const hasInputImages = inputImages && inputImages.length > 0;

  if (hasInputFiles || hasInputImages) {
    const messageContent = [];

    // Archivos (PDFs, documentos) como input_file
    if (hasInputFiles) {
      for (const file of inputFiles) {
        messageContent.push({ type: 'input_text', text: file.marker });
        messageContent.push({ type: 'input_file', file_id: file.fileId });
      }
    }

    // Imagenes como input_image
    if (hasInputImages) {
      for (const img of inputImages) {
        messageContent.push({ type: 'input_text', text: img.marker });
        if (img.fileId) {
          // Imagen subida como archivo a OpenAI Files API
          messageContent.push({ type: 'input_image', file_id: img.fileId });
        } else if (img.base64) {
          // Fallback: base64 inline
          messageContent.push({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.base64}` });
        }
      }
    }

    body.input = [{
      type: 'message',
      role: 'user',
      content: messageContent
    }];

    const parts = [];
    if (hasInputFiles) parts.push(`${inputFiles.length} archivo(s): ${inputFiles.map(f => `${f.marker}=${f.fileId}`).join(', ')}`);
    if (hasInputImages) parts.push(`${inputImages.length} imagen(es): ${inputImages.map(i => `${i.marker}=${i.fileId || 'base64'}`).join(', ')}`);
    console.log(`[baseAIClient] Adjuntando via body.input: ${parts.join(' + ')}`);
  }

  if (model) {
    body.model = model;
  }

  if (maxOutputTokens) {
    body.max_output_tokens = maxOutputTokens;
  }

  if (temperature !== undefined) {
    body.temperature = parseFloat(temperature) || 0.7;
  }

  const responsesApiUrl = deriveResponsesApiUrl(apiUrl);

  console.log(`[baseAIClient] === REQUEST A OPENAI ===`);
  console.log(`[baseAIClient] URL: ${responsesApiUrl}`);
  console.log(`[baseAIClient] stored prompt: ${promptId}, version: ${promptVersion || 'current'}, modelo: ${model || 'default'}`);
  console.log(`[baseAIClient] variables: [${Object.keys(variables).join(', ')}]`);
  console.log(`[baseAIClient] body.input presente: ${!!body.input}, items: ${body.input ? body.input.length : 0}`);
  if (body.input) {
    body.input.forEach((item, i) => {
      console.log(`[baseAIClient] body.input[${i}]: type=${item.type}, role=${item.role}, content items=${Array.isArray(item.content) ? item.content.length : 'N/A'}`);
      if (Array.isArray(item.content)) {
        item.content.forEach((c, j) => {
          if (c.type === 'input_text') {
            console.log(`[baseAIClient]   content[${j}]: type=input_text, text="${c.text}"`);
          } else if (c.type === 'input_image') {
            console.log(`[baseAIClient]   content[${j}]: type=input_image, file_id=${c.file_id || 'N/A'}, url_length=${c.image_url?.length || 0}`);
          } else if (c.type === 'input_file') {
            console.log(`[baseAIClient]   content[${j}]: type=input_file, file_id=${c.file_id}`);
          }
        });
      }
    });
  }
  // Log del body sin base64 (para no inundar la consola)
  const bodyForLog = JSON.parse(JSON.stringify(body));
  if (bodyForLog.input) {
    bodyForLog.input.forEach(item => {
      if (Array.isArray(item.content)) {
        item.content.forEach(c => {
          if (c.type === 'input_image' && c.image_url) {
            c.image_url = c.image_url.substring(0, 50) + `...[${c.image_url.length} chars total]`;
          }
        });
      }
    });
  }
  // Truncar variables largas en el log
  if (bodyForLog.prompt?.variables) {
    for (const [k, v] of Object.entries(bodyForLog.prompt.variables)) {
      if (typeof v === 'string' && v.length > 200) {
        bodyForLog.prompt.variables[k] = v.substring(0, 200) + `...[${v.length} chars]`;
      }
    }
  }
  console.log(`[baseAIClient] body completo (truncado): ${JSON.stringify(bodyForLog)}`);

  const response = await fetch(responsesApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  console.log(`[baseAIClient] === RESPUESTA OPENAI ===`);
  console.log(`[baseAIClient] HTTP status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || `Error de OpenAI Responses API: ${response.status}`;
    console.error(`[baseAIClient] ERROR OpenAI: ${JSON.stringify(errorData).substring(0, 500)}`);

    // Detectar error de variables desconocidas para auto-retry
    const unknownMatch = errorMsg.match(/Unknown prompt variables?:\s*(.+)/i);
    if (unknownMatch) {
      const unknownVars = unknownMatch[1].split(',').map(v => v.trim());
      return { success: false, content: '', error: errorMsg, unknownVars };
    }

    throw new Error(errorMsg);
  }

  const data = await response.json();

  // Log de la respuesta cruda (sin contenido completo para no inundar)
  console.log(`[baseAIClient] response.id: ${data.id}`);
  console.log(`[baseAIClient] response.model: ${data.model}`);
  console.log(`[baseAIClient] response.status: ${data.status}`);
  console.log(`[baseAIClient] response.output type: ${typeof data.output}, isArray: ${Array.isArray(data.output)}`);
  if (Array.isArray(data.output)) {
    data.output.forEach((item, i) => {
      console.log(`[baseAIClient] output[${i}]: type=${item.type}, role=${item.role}, content_items=${Array.isArray(item.content) ? item.content.length : 'N/A'}`);
      if (Array.isArray(item.content)) {
        item.content.forEach((c, j) => {
          console.log(`[baseAIClient]   output[${i}].content[${j}]: type=${c.type}, text_length=${c.text?.length || 0}, text_preview="${(c.text || '').substring(0, 150)}"`);
        });
      }
    });
  }

  let content = '';
  const annotations = [];
  let refusal = null;

  if (data.output) {
    if (Array.isArray(data.output)) {
      content = data.output
        .filter(item => item.type === 'message' && item.content)
        .map(item => {
          if (Array.isArray(item.content)) {
            return item.content
              .filter(c => c.type === 'output_text')
              .map(c => {
                if (c.annotations && c.annotations.length > 0) {
                  annotations.push(...c.annotations);
                }
                return c.text;
              })
              .join('');
          }
          if (item.refusal) refusal = item.refusal;
          return item.content;
        })
        .join('\n');
    } else if (typeof data.output === 'string') {
      content = data.output;
    }
  }

  if (!content) {
    throw new Error('Respuesta vacia de OpenAI Responses API');
  }

  console.log(`[baseAIClient] Respuesta stored prompt: ${content.length} caracteres`);

  return {
    success: true,
    content,
    metadata: {
      responseId: data.id,
      model: data.model,
      status: data.status,
      usage: data.usage || null,
      incompleteDetails: data.incomplete_details || null,
      annotations,
      refusal,
      endpoint: responsesApiUrl
    }
  };
}

// =====================================================
// CONTINUAR CONVERSACION (usado por chat)
// =====================================================

/**
 * Continua una conversacion con historial de mensajes
 * @param {Array} messages - Array de mensajes [{role, content}]
 * @param {string} serviceType - Tipo de servicio
 * @returns {Promise<{success: boolean, content: string, provider: string, model: string, error?: string}>}
 */
async function continueConversation(messages, serviceType = 'TRANSLATE') {
  const config = await getServiceConfig(serviceType);

  if (!config || !config.apiKey || !config.isActive) {
    return { success: false, content: '', provider: 'unknown', model: 'unknown', error: `Servicio ${serviceType} no disponible` };
  }

  try {
    const rawUrl = config.apiUrl || DEFAULT_CHAT_API_URL;
    const chatApiUrl = rawUrl.replace(/\/responses\/?$/, '/chat/completions');

    const response = await fetch(chatApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: messages,
        max_tokens: config.maxTokens || 16384,
        temperature: parseFloat(config.temperature) || 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Error del proveedor de IA: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Respuesta vacia del proveedor de IA');
    }

    return { success: true, content, provider: 'openai', model: config.aiModel, usage: data.usage || null };
  } catch (error) {
    return { success: false, content: '', provider: 'openai', model: config.aiModel || 'unknown', error: error.message };
  }
}

// =====================================================
// OPENAI FILES API (Para subir archivos y usar input_file)
// =====================================================

/**
 * Sube una imagen en base64 a la OpenAI Files API.
 * Retorna el file_id para referenciarla como input_image con file_id.
 *
 * @param {string} base64Data - Datos de la imagen en base64
 * @param {string} mimeType - Tipo MIME (image/jpeg, image/png, etc.)
 * @param {string} apiKey - API Key de OpenAI
 * @returns {Promise<string>} file_id del archivo subido
 */
async function uploadBase64ImageToOpenAI(base64Data, mimeType, apiKey) {
  const buffer = Buffer.from(base64Data, 'base64');
  const ext = mimeType.split('/')[1] || 'png';
  const fileName = `image_${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('purpose', 'user_data');
  formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

  console.log(`[baseAIClient] Subiendo imagen a OpenAI: ${fileName} (${buffer.length} bytes, ${mimeType})`);

  const response = await fetch(DEFAULT_FILES_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Error subiendo imagen a OpenAI: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[baseAIClient] Imagen subida: ${data.id} (${fileName})`);
  return data.id;
}

/**
 * Sube un archivo a la OpenAI Files API para usarlo como input_file
 * en variables de stored prompts. Permite enviar documentos completos
 * (texto + imagenes) sin necesidad de separarlos.
 *
 * @param {string} filePath - Ruta local absoluta del archivo
 * @param {string} apiKey - API Key de OpenAI
 * @returns {Promise<string>} file_id del archivo subido (ej: "file-abc123")
 */
async function uploadFileToOpenAI(filePath, apiKey) {
  const fileBuffer = await fs.promises.readFile(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append('purpose', 'user_data');
  formData.append('file', new Blob([fileBuffer]), fileName);

  console.log(`[baseAIClient] Subiendo archivo a OpenAI: ${fileName} (${fileBuffer.length} bytes)`);

  const response = await fetch(DEFAULT_FILES_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Error subiendo archivo a OpenAI: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[baseAIClient] Archivo subido: ${data.id} (${fileName})`);
  return data.id;
}

/**
 * Elimina un archivo previamente subido a OpenAI Files API.
 * Se llama despues de recibir la respuesta de la IA para limpiar.
 *
 * @param {string} fileId - ID del archivo en OpenAI (ej: "file-abc123")
 * @param {string} apiKey - API Key de OpenAI
 */
async function deleteFileFromOpenAI(fileId, apiKey) {
  try {
    await fetch(`${DEFAULT_FILES_API_URL}/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    console.log(`[baseAIClient] Archivo eliminado de OpenAI: ${fileId}`);
  } catch (err) {
    console.warn(`[baseAIClient] Error eliminando archivo ${fileId} de OpenAI: ${err.message}`);
  }
}

module.exports = {
  getServiceConfig,
  callOpenAIResponsesAPI,
  continueConversation,
  uploadFileToOpenAI,
  uploadBase64ImageToOpenAI,
  deleteFileFromOpenAI
};
