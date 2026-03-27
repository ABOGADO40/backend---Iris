// =====================================================
// SISTEMA IRIS - AI Config Model
// Modelo para configuracion de servicios IA
// Usa queries raw para compatibilidad sin modelo Prisma
// =====================================================

const crypto = require('crypto');
const prisma = require('../config/prisma');

// Clave de encriptacion (debe estar en .env)
const ENCRYPTION_KEY = process.env.AI_ENCRYPTION_KEY || 'default-encryption-key-change-me!';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// =====================================================
// ENCRIPTACION / DESENCRIPTACION
// =====================================================

/**
 * Encripta un texto usando AES-256-CBC
 */
function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Desencripta un texto encriptado con AES-256-CBC
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Error desencriptando:', error.message);
    return null;
  }
}

// =====================================================
// CRUD OPERACIONES (usando queries raw)
// =====================================================

/**
 * Obtener variables de prompt para un servicio desde tabla relacional
 */
async function getPromptVariablesByService(serviceType) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT internal_key as "internalKey", prompt_var_name as "promptVarName",
             description, display_order as "displayOrder"
      FROM ai_config_variables
      WHERE service_type = ${serviceType}
      ORDER BY display_order ASC
    `;
    return rows || [];
  } catch (error) {
    console.error('Error obteniendo variables de prompt:', error.message);
    return [];
  }
}

/**
 * Convierte filas de variables a objeto de mapeo { internalKey: promptVarName }
 */
function buildVariableMapping(rows) {
  if (!rows || rows.length === 0) return null;
  const mapping = {};
  for (const row of rows) {
    mapping[row.internalKey] = row.promptVarName;
  }
  return mapping;
}

/**
 * Obtener todas las configuraciones de servicios IA
 */
async function getAllConfigs() {
  try {
    const configs = await prisma.$queryRaw`
      SELECT
        id,
        service_type as "serviceType",
        service_name as "serviceName",
        service_description as "serviceDescription",
        api_url as "apiUrl",
        ai_model as "aiModel",
        max_tokens as "maxTokens",
        temperature,
        is_active as "isActive",
        prompt_id as "promptId",
        prompt_version as "promptVersion",
        use_responses_api as "useResponsesApi",
        CASE WHEN api_key_encrypted IS NOT NULL THEN '********' ELSE NULL END as "apiKeyEncrypted",
        CASE WHEN api_key_encrypted IS NOT NULL THEN true ELSE false END as "hasApiKey",
        date_time_registration as "dateTimeRegistration",
        date_time_modification as "dateTimeModification"
      FROM ai_service_configs
      ORDER BY service_type ASC
    `;

    // Agregar variables de prompt desde tabla relacional
    for (const config of configs) {
      const varRows = await getPromptVariablesByService(config.serviceType);
      config.promptVariables = varRows;
    }

    return configs;
  } catch (error) {
    console.error('Error obteniendo configs:', error.message);
    return [];
  }
}

/**
 * Obtener configuracion por tipo de servicio
 */
async function getConfigByServiceType(serviceType) {
  try {
    const configs = await prisma.$queryRaw`
      SELECT
        id,
        service_type as "serviceType",
        service_name as "serviceName",
        service_description as "serviceDescription",
        api_key_encrypted as "apiKeyEncrypted",
        api_url as "apiUrl",
        ai_model as "aiModel",
        max_tokens as "maxTokens",
        temperature,
        is_active as "isActive",
        prompt_id as "promptId",
        prompt_version as "promptVersion",
        use_responses_api as "useResponsesApi",
        date_time_registration as "dateTimeRegistration",
        date_time_modification as "dateTimeModification"
      FROM ai_service_configs
      WHERE service_type = ${serviceType}
      LIMIT 1
    `;

    if (!configs || configs.length === 0) return null;

    const config = configs[0];

    // Obtener variables desde tabla relacional y construir mapeo
    const varRows = await getPromptVariablesByService(serviceType);
    const promptVariables = buildVariableMapping(varRows);

    return {
      ...config,
      apiKey: decrypt(config.apiKeyEncrypted),
      apiKeyEncrypted: undefined,
      promptVariables
    };
  } catch (error) {
    console.error('Error obteniendo config:', error.message);
    return null;
  }
}

/**
 * Actualizar configuracion de un servicio IA
 */
async function updateConfig(serviceType, data, userId) {
  try {
    // Construir SET dinamico
    const updates = [];
    const values = [];

    if (data.serviceName !== undefined) {
      updates.push('service_name = $' + (values.length + 1));
      values.push(data.serviceName);
    }
    if (data.serviceDescription !== undefined) {
      updates.push('service_description = $' + (values.length + 1));
      values.push(data.serviceDescription);
    }
    if (data.apiUrl !== undefined) {
      updates.push('api_url = $' + (values.length + 1));
      values.push(data.apiUrl);
    }
    if (data.aiModel !== undefined) {
      updates.push('ai_model = $' + (values.length + 1));
      values.push(data.aiModel);
    }
    if (data.maxTokens !== undefined) {
      updates.push('max_tokens = $' + (values.length + 1));
      values.push(data.maxTokens);
    }
    if (data.temperature !== undefined) {
      updates.push('temperature = $' + (values.length + 1));
      values.push(data.temperature);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = $' + (values.length + 1));
      values.push(data.isActive);
    }
    if (data.promptId !== undefined) {
      updates.push('prompt_id = $' + (values.length + 1));
      values.push(data.promptId);
    }
    if (data.promptVersion !== undefined) {
      updates.push('prompt_version = $' + (values.length + 1));
      values.push(data.promptVersion);
    }
    if (data.useResponsesApi !== undefined) {
      updates.push('use_responses_api = $' + (values.length + 1));
      values.push(data.useResponsesApi);
    }
    if (data.apiKey !== undefined && data.apiKey !== null) {
      updates.push('api_key_encrypted = $' + (values.length + 1));
      values.push(data.apiKey ? encrypt(data.apiKey) : null);
    }

    updates.push('user_id_modification = $' + (values.length + 1));
    values.push(userId);
    updates.push('date_time_modification = NOW()');

    values.push(serviceType);
    const whereIndex = values.length;

    await prisma.$executeRawUnsafe(`
      UPDATE ai_service_configs
      SET ${updates.join(', ')}
      WHERE service_type = $${whereIndex}
    `, ...values);

    // Retornar configuracion actualizada
    return await getConfigByServiceType(serviceType);
  } catch (error) {
    console.error('Error actualizando config:', error.message);
    throw error;
  }
}

/**
 * Verificar si un servicio esta activo y tiene API key configurada
 */
async function isServiceActive(serviceType) {
  try {
    const result = await prisma.$queryRaw`
      SELECT is_active as "isActive",
             CASE WHEN api_key_encrypted IS NOT NULL THEN true ELSE false END as "hasKey"
      FROM ai_service_configs
      WHERE service_type = ${serviceType}
      LIMIT 1
    `;

    return result && result.length > 0 && result[0].isActive && result[0].hasKey;
  } catch (error) {
    console.error('Error verificando servicio:', error.message);
    return false;
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getAllConfigs,
  getConfigByServiceType,
  getPromptVariablesByService,
  buildVariableMapping,
  updateConfig,
  isServiceActive
};
