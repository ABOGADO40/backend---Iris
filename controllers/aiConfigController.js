// =====================================================
// SISTEMA IRIS - AI Config Controller
// Controlador para configuracion de servicios IA
// =====================================================

const prisma = require('../config/prisma');
const aiConfigModel = require('../models/aiConfigModel');

// =====================================================
// UTILIDADES
// =====================================================

/**
 * Registra una accion en el audit log
 */
async function logAudit(actorUserId, actionCode, entityType, entityId, details, req) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        actionCode,
        entityType,
        entityId,
        details,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
        userIdRegistration: actorUserId
      }
    });
  } catch (error) {
    console.error('Error registrando audit log:', error.message);
  }
}

// =====================================================
// OBTENER TODAS LAS CONFIGURACIONES
// =====================================================

/**
 * GET /api/ai-config
 * Obtiene todas las configuraciones de servicios IA
 */
async function getAll(req, res) {
  try {
    const configs = await aiConfigModel.getAllConfigs();

    return res.status(200).json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error('Error en getAll:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// OBTENER CONFIGURACION POR TIPO
// =====================================================

/**
 * GET /api/ai-config/:serviceType
 * Obtiene la configuracion de un servicio especifico
 */
async function getByServiceType(req, res) {
  try {
    const { serviceType } = req.params;
    const config = await aiConfigModel.getConfigByServiceType(serviceType);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuracion no encontrada'
      });
    }

    // No devolver la API key desencriptada en la respuesta
    const safeConfig = {
      ...config,
      apiKey: undefined,
      hasApiKey: !!config.apiKey
    };

    return res.status(200).json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    console.error('Error en getByServiceType:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// ACTUALIZAR CONFIGURACION
// =====================================================

/**
 * PATCH /api/ai-config/:serviceType
 * Actualiza la configuracion de un servicio IA
 */
async function update(req, res) {
  try {
    const userId = req.user.id;
    const { serviceType } = req.params;
    const { apiKey, apiUrl, aiModel, maxTokens, temperature, isActive, serviceName, serviceDescription, promptId } = req.body;

    // Verificar que existe la configuracion
    const existingConfig = await aiConfigModel.getConfigByServiceType(serviceType);

    if (!existingConfig) {
      return res.status(404).json({
        success: false,
        error: 'Configuracion no encontrada'
      });
    }

    const updateData = {};
    if (apiKey !== undefined) updateData.apiKey = apiKey;
    if (apiUrl !== undefined) updateData.apiUrl = apiUrl;
    if (aiModel !== undefined) updateData.aiModel = aiModel;
    if (maxTokens !== undefined) updateData.maxTokens = maxTokens;
    if (temperature !== undefined) updateData.temperature = temperature;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (serviceName !== undefined) updateData.serviceName = serviceName;
    if (serviceDescription !== undefined) updateData.serviceDescription = serviceDescription;
    if (promptId !== undefined) {
      updateData.promptId = promptId || null;
      updateData.useResponsesApi = !!promptId;
    }

    const updated = await aiConfigModel.updateConfig(serviceType, updateData, userId);

    await logAudit(userId, 'AI_CONFIG_UPDATE', 'AiServiceConfig', existingConfig.id, {
      serviceType,
      fieldsUpdated: Object.keys(updateData).filter(k => k !== 'apiKey')
    }, req);

    return res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error en update:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// VERIFICAR ESTADO DE SERVICIO
// =====================================================

/**
 * GET /api/ai-config/:serviceType/status
 * Verifica si un servicio esta activo y configurado
 */
async function checkStatus(req, res) {
  try {
    const { serviceType } = req.params;
    const isActive = await aiConfigModel.isServiceActive(serviceType);

    return res.status(200).json({
      success: true,
      data: {
        serviceType,
        isActive,
        isConfigured: isActive
      }
    });
  } catch (error) {
    console.error('Error en checkStatus:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// TEST DE CONEXION
// =====================================================

/**
 * POST /api/ai-config/:serviceType/test
 * Prueba la conexion con el servicio de IA
 */
async function testConnection(req, res) {
  try {
    const userId = req.user.id;
    const { serviceType } = req.params;
    const config = await aiConfigModel.getConfigByServiceType(serviceType);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuracion no encontrada'
      });
    }

    if (!config.apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API Key no configurada'
      });
    }

    // Hacer una llamada de prueba al proveedor de IA
    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.aiModel,
          messages: [
            { role: 'user', content: 'Responde solo con "OK"' }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(200).json({
          success: true,
          data: {
            testPassed: false,
            error: errorData.error?.message || `Error HTTP ${response.status}`
          }
        });
      }

      const data = await response.json();
      const testPassed = !!data.choices?.[0]?.message?.content;

      await logAudit(userId, 'AI_CONFIG_TEST', 'AiServiceConfig', config.id, {
        serviceType,
        testPassed
      }, req);

      return res.status(200).json({
        success: true,
        data: {
          testPassed,
          response: testPassed ? 'Conexion exitosa' : 'Sin respuesta del modelo'
        }
      });
    } catch (fetchError) {
      return res.status(200).json({
        success: true,
        data: {
          testPassed: false,
          error: fetchError.message
        }
      });
    }
  } catch (error) {
    console.error('Error en testConnection:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// OBTENER VARIABLES DE PROMPT
// =====================================================

/**
 * GET /api/ai-config/:serviceType/variables
 * Obtiene las variables de prompt configuradas para un servicio
 */
async function getVariables(req, res) {
  try {
    const { serviceType } = req.params;
    const variables = await aiConfigModel.getPromptVariablesByService(serviceType);

    return res.status(200).json({
      success: true,
      data: variables
    });
  } catch (error) {
    console.error('Error en getVariables:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getAll,
  getByServiceType,
  update,
  checkStatus,
  testConnection,
  getVariables
};
