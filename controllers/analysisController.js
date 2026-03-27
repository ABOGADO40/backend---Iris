// =====================================================
// SISTEMA IRIS - Analysis Controller
// Controlador para analisis de IA
// Soporta procesamiento automatico de documentos e imagenes
// =====================================================

const prisma = require('../config/prisma');
const { CHAT_SYSTEM_PROMPTS, CHAT_DEFAULT_SYSTEM_PROMPT, CHAT_CONTEXT_MAX_CHARS } = require('../services/analysis/shared/constants');

// Helper: convierte BigInt a Number recursivamente para que JSON.stringify no falle
function serializeBigInts(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeBigInts(obj[key]);
    }
    return result;
  }
  return obj;
}

const aiService = require('../services/aiService');
const analysisModel = require('../models/analysisModel');

// Pipeline canonico
const requestNormalizer = require('../services/analysis/requestNormalizer');
const contentRouter = require('../services/analysis/contentRouter');
const { recordUsage } = require('../services/analysis/shared/usageTracker');

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
// FLW-100: TRADUCIR A LENGUAJE COMUN
// =====================================================

/**
 * POST /api/analysis/translate
 * Traduce un peritaje a lenguaje comun
 * Soporta nuevos campos para OpenAI Responses API
 * Soporta procesamiento automatico de documentos e imagenes
 */
async function translate(req, res) {
  try {
    const normalized = await requestNormalizer.normalize(req, 'TRANSLATE');
    if (normalized.error) {
      return res.status(normalized.statusCode).json({ success: false, error: normalized.error });
    }

    // --- Debug mode ---
    const debugEnabled = process.env.AI_DEBUG_ENABLED !== 'false';
    const debugRequested = req.headers['x-ai-debug'] === '1' || req.query.aiDebug === '1';

    if (debugEnabled && debugRequested) {
      const sendToo = req.headers['x-ai-debug-send'] === '1';
      normalized._debug = {
        dryRun: !sendToo,
        sendToo
      };
    }

    const result = await contentRouter.route(normalized);

    if (result.auditAction) {
      await logAudit(normalized.userId, result.auditAction, 'AnalysisRequest', result.data?.requestId || null, result.auditDetails || {}, req);
    }

    if (!result.success && !result._diagnostic) {
      if (result.statusCode === 400) {
        return res.status(400).json({ success: false, error: result.error });
      }
      await logAudit(normalized.userId, 'ANALYSIS_TRANSLATE_FAILED', 'AnalysisRequest', result.requestId || null, { error: result.error || result.details, caseId: normalized.parsedCaseId }, req);
      return res.status(500).json({ success: false, error: result.error, details: result.details });
    }

    // Si hay diagnostico, incluirlo en la respuesta
    const response = { success: true, data: result.data || null };
    if (result._diagnostic) {
      response._diagnostic = result._diagnostic;
    }

    return res.status(result._diagnostic && !result.data ? 200 : 201).json(response);
  } catch (error) {
    console.error('Error en translate:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor', details: error.message });
  }
}

// =====================================================
// FLW-110: RECOMENDAR PERITAJES (delegado a pipeline)
// =====================================================

async function recommend(req, res) {
  try {
    const normalized = await requestNormalizer.normalize(req, 'RECOMMEND');
    if (normalized.error) {
      return res.status(normalized.statusCode).json({ success: false, error: normalized.error });
    }

    const result = await contentRouter.route(normalized);

    if (result.auditAction) {
      await logAudit(normalized.userId, result.auditAction, 'AnalysisRequest', result.data?.requestId || result.requestId || null, result.auditDetails || {}, req);
    }

    if (!result.success) {
      if (result.statusCode === 400) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.status(500).json({ success: false, error: result.error, details: result.details });
    }

    return res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error en recommend:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor', details: error.message });
  }
}

// =====================================================
// FLW-120: COMPARAR EVIDENCIAS (delegado a pipeline)
// =====================================================

async function compare(req, res) {
  try {
    const normalized = await requestNormalizer.normalize(req, 'COMPARE');
    if (normalized.error) {
      return res.status(normalized.statusCode).json({ success: false, error: normalized.error });
    }

    const result = await contentRouter.route(normalized);

    if (result.auditAction) {
      await logAudit(normalized.userId, result.auditAction, 'AnalysisRequest', result.data?.requestId || result.requestId || null, result.auditDetails || {}, req);
    }

    if (!result.success) {
      if (result.statusCode === 400) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.status(500).json({ success: false, error: result.error, details: result.details });
    }

    return res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error en compare:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor', details: error.message });
  }
}

// =====================================================
// FLW-130: GENERAR OBJECIONES (delegado a pipeline)
// =====================================================

async function generateObjections(req, res) {
  try {
    const normalized = await requestNormalizer.normalize(req, 'OBJECTIONS');
    if (normalized.error) {
      return res.status(normalized.statusCode).json({ success: false, error: normalized.error });
    }

    const result = await contentRouter.route(normalized);

    if (result.auditAction) {
      await logAudit(normalized.userId, result.auditAction, 'AnalysisRequest', result.data?.requestId || result.requestId || null, result.auditDetails || {}, req);
    }

    if (!result.success) {
      if (result.statusCode === 400) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.status(500).json({ success: false, error: result.error, details: result.details });
    }

    return res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error en generateObjections:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor', details: error.message });
  }
}

// =====================================================
// FLW-200: HISTORIAL DE ANALISIS
// =====================================================

/**
 * GET /api/analysis/history
 * Obtiene el historial de analisis del usuario
 */
async function getHistory(req, res) {
  try {
    const userId = req.user.id;
    const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : userId;
    const { serviceType, status, fromDate, toDate, page, limit, caseId } = req.query;

    const filters = {
      serviceType,
      status,
      fromDate,
      toDate,
      caseId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    };

    const result = await analysisModel.getRequestsByUser(filterUserId, filters);

    await logAudit(userId, 'ANALYSIS_HISTORY_VIEW', 'AnalysisRequest', null, {
      filters,
      resultCount: result.data.length
    }, req);

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Error en getHistory:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// OBTENER ANALISIS POR ID
// =====================================================

/**
 * GET /api/analysis/:id
 * Obtiene un analisis especifico por ID
 */
async function getById(req, res) {
  try {
    const userId = req.user.id;
    const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : userId;
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de solicitud invalido'
      });
    }

    const request = await analysisModel.getRequestById(requestId, filterUserId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Analisis no encontrado'
      });
    }

    await logAudit(userId, 'ANALYSIS_VIEW', 'AnalysisRequest', requestId, {
      serviceType: request.serviceType,
      status: request.status
    }, req);

    // Transformar datos para compatibilidad con frontend
    // Frontend espera campos especificos que difieren de la estructura de BD

    // Transformar evidencia principal
    let transformedEvidence = null;
    if (request.evidence) {
      transformedEvidence = {
        id: request.evidence.id,
        title: request.evidence.title,
        fileName: request.evidence.evidenceFile?.originalFilename || request.evidence.title || '-',
        fileType: request.evidence.tipoEvidencia || request.evidence.evidenceType || '-',
        evidenceType: request.evidence.evidenceType,
        notes: request.evidence.notes,
        // Incluir caso asociado al analisis
        case: request.case ? { id: request.case.id, title: request.case.title } : null
      };
    }

    // Transformar evidencia B (para comparaciones)
    let transformedEvidenceB = null;
    if (request.evidenceB) {
      transformedEvidenceB = {
        id: request.evidenceB.id,
        title: request.evidenceB.title,
        fileName: request.evidenceB.evidenceFile?.originalFilename || request.evidenceB.title || '-',
        fileType: request.evidenceB.tipoEvidencia || request.evidenceB.evidenceType || '-',
        evidenceType: request.evidenceB.evidenceType,
        notes: request.evidenceB.notes
      };
    }

    const transformedData = {
      ...request,
      result: request.analysisResult?.resultText || null,
      content: request.analysisResult?.resultText || null,
      createdAt: request.dateTimeRegistration,
      evidence: transformedEvidence,
      evidenceB: transformedEvidenceB,
      // Para comparaciones, el frontend usa evidenceA y evidenceB
      evidenceA: transformedEvidence,
      // Incluir analysisResult con ID para exportaciones
      analysisResult: request.analysisResult ? {
        id: request.analysisResult.id,
        resultText: request.analysisResult.resultText
      } : null,
      // Tambien exponer resultId directamente para compatibilidad
      resultId: request.analysisResult?.id || null
    };

    return res.status(200).json({
      success: true,
      data: serializeBigInts(transformedData)
    });
  } catch (error) {
    console.error('Error en getById:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// OBTENER ANALISIS POR EVIDENCIA
// =====================================================

/**
 * GET /api/analysis/by-evidence/:evidenceId
 * Obtiene todos los analisis de una evidencia especifica
 */
async function getByEvidence(req, res) {
  try {
    const userId = req.user.id;
    const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : userId;
    const evidenceId = parseInt(req.params.evidenceId);

    if (isNaN(evidenceId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de evidencia invalido'
      });
    }

    // Verificar que la evidencia existe (y pertenece al usuario si no es admin)
    const evidence = await prisma.evidence.findFirst({
      where: {
        id: evidenceId,
        ...(filterUserId && { ownerUserId: filterUserId }),
      }
    });

    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: 'Evidencia no encontrada'
      });
    }

    // Obtener todos los analisis relacionados con esta evidencia
    // Incluye evidenceId (principal) y evidenceIdB (para comparaciones)
    const analyses = await prisma.analysisRequest.findMany({
      where: {
        ...(filterUserId && { requesterUserId: filterUserId }),
        OR: [
          { evidenceId: evidenceId },
          { evidenceIdB: evidenceId }
        ],
        status: 'COMPLETED'
      },
      include: {
        analysisResult: true
      },
      orderBy: { dateTimeRegistration: 'desc' }
    });

    // Formatear respuesta
    const formattedAnalyses = analyses.map(analysis => ({
      id: analysis.id,
      serviceType: analysis.serviceType,
      title: analysis.title || getServiceTitle(analysis.serviceType),
      isSaved: analysis.isSaved || false,
      createdAt: analysis.dateTimeRegistration,
      provider: analysis.aiProvider,
      model: analysis.aiModel,
      result: analysis.analysisResult ? {
        id: analysis.analysisResult.id,
        textOutput: analysis.analysisResult.resultText?.substring(0, 300) + '...',
        structuredOutput: analysis.analysisResult.resultStructuredJson
      } : null
    }));

    return res.status(200).json({
      success: true,
      data: formattedAnalyses,
      count: formattedAnalyses.length
    });
  } catch (error) {
    console.error('Error en getByEvidence:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

/**
 * Helper para obtener titulo por defecto del servicio
 */
function getServiceTitle(serviceType) {
  const titles = {
    'TRANSLATE': 'Traduccion Pericial',
    'RECOMMEND': 'Recomendacion de Peritos',
    'COMPARE': 'Comparacion de Evidencias',
    'OBJECTIONS': 'Objeciones Tecnicas'
  };
  return titles[serviceType] || 'Analisis IA';
}

// =====================================================
// BUSQUEDA FULL-TEXT
// =====================================================

/**
 * GET /api/analysis/search
 * Busca en los resultados de analisis del usuario
 */
async function search(req, res) {
  try {
    const userId = req.user.id;
    const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : userId;
    const { q, page, limit } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El parametro de busqueda "q" es requerido'
      });
    }

    if (q.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'El termino de busqueda debe tener al menos 3 caracteres'
      });
    }

    const result = await analysisModel.searchResults(
      filterUserId,
      q,
      parseInt(page) || 1,
      parseInt(limit) || 20
    );

    await logAudit(userId, 'ANALYSIS_SEARCH', 'AnalysisResult', null, {
      query: q,
      resultCount: result.data.length
    }, req);

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Error en search:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// CONTINUAR CONVERSACION (CHAT)
// =====================================================

/**
 * POST /api/analysis/:id/chat
 * Continua una conversacion de analisis con historial
 */
async function chat(req, res) {
  try {
    const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const userId = req.user.id;
    const requestId = parseInt(req.params.id);
    const { message } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de solicitud invalido'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El mensaje es requerido'
      });
    }

    // Verificar que el analisis existe (y pertenece al usuario si no es admin)
    const analysisRequest = await prisma.analysisRequest.findFirst({
      where: {
        id: requestId,
        ...(filterUserId && { requesterUserId: filterUserId }),
      },
      include: {
        analysisResult: true
      }
    });

    if (!analysisRequest) {
      return res.status(404).json({
        success: false,
        error: 'Analisis no encontrado'
      });
    }

    // Obtener mensajes previos del chat
    const previousMessages = await prisma.analysisMessage.findMany({
      where: { analysisRequestId: requestId },
      orderBy: { dateTimeRegistration: 'asc' }
    });

    // Construir contexto del sistema basado en el tipo de servicio
    const systemContext = getSystemContextForService(analysisRequest.serviceType);
    const originalResult = analysisRequest.analysisResult?.resultText || '';

    // Construir historial de mensajes para Chat Completions API
    const messages = [
      { role: 'system', content: systemContext },
      { role: 'assistant', content: `Analisis previo:\n\n${originalResult.substring(0, CHAT_CONTEXT_MAX_CHARS)}` }
    ];

    // Agregar mensajes previos del chat
    previousMessages.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Agregar el nuevo mensaje del usuario
    messages.push({ role: 'user', content: message.trim() });

    // Usar continueConversation que fuerza Chat Completions API (no Responses API)
    const aiResult = await aiService.continueConversation(
      messages,
      analysisRequest.serviceType
    );

    if (!aiResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Error al procesar el mensaje',
        details: aiResult.error
      });
    }

    // Registrar consumo de tokens del chat
    recordUsage({
      userId,
      serviceType: analysisRequest.serviceType,
      requestId,
      caseId: analysisRequest.caseId,
      usage: aiResult.usage,
      model: aiResult.model,
      callType: 'followup_chat'
    });

    // Guardar mensajes en la base de datos
    await prisma.analysisMessage.createMany({
      data: [
        {
          analysisRequestId: requestId,
          role: 'user',
          content: message.trim(),
          userIdRegistration: userId
        },
        {
          analysisRequestId: requestId,
          role: 'assistant',
          content: aiResult.content,
          userIdRegistration: userId
        }
      ]
    });

    return res.status(200).json({
      success: true,
      data: {
        role: 'assistant',
        content: aiResult.content,
        provider: aiResult.provider,
        model: aiResult.model
      }
    });
  } catch (error) {
    console.error('Error en chat:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

/**
 * Helper para obtener contexto del sistema por tipo de servicio
 */
function getSystemContextForService(serviceType) {
  return CHAT_SYSTEM_PROMPTS[serviceType] || CHAT_DEFAULT_SYSTEM_PROMPT;
}

// =====================================================
// GUARDAR ANALISIS
// =====================================================

/**
 * PATCH /api/analysis/:id/save
 * Marca un analisis como guardado y le asigna un titulo
 */
async function saveAnalysis(req, res) {
  try {
    const userId = req.user.id;
    const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : userId;
    const requestId = parseInt(req.params.id);
    const { title } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de solicitud invalido'
      });
    }

    // Verificar que el analisis existe (y pertenece al usuario si no es admin)
    const analysisRequest = await prisma.analysisRequest.findFirst({
      where: {
        id: requestId,
        ...(filterUserId && { requesterUserId: filterUserId }),
      }
    });

    if (!analysisRequest) {
      return res.status(404).json({
        success: false,
        error: 'Analisis no encontrado'
      });
    }

    // Actualizar el analisis
    const updated = await prisma.analysisRequest.update({
      where: { id: requestId },
      data: {
        title: title || getServiceTitle(analysisRequest.serviceType),
        isSaved: true,
        userIdModification: userId,
        dateTimeModification: new Date()
      }
    });

    await logAudit(userId, 'ANALYSIS_SAVED', 'AnalysisRequest', requestId, {
      title: updated.title
    }, req);

    return res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
        isSaved: updated.isSaved
      }
    });
  } catch (error) {
    console.error('Error en saveAnalysis:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// OBTENER MENSAJES DE CHAT
// =====================================================

/**
 * GET /api/analysis/:id/messages
 * Obtiene los mensajes de chat de un analisis
 */
async function getMessages(req, res) {
  try {
    const userId = req.user.id;
    const filterUserId = req.user.roleName === 'SUPER_ADMIN' ? null : userId;
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de solicitud invalido'
      });
    }

    // Verificar que el analisis existe (y pertenece al usuario si no es admin)
    const analysisRequest = await prisma.analysisRequest.findFirst({
      where: {
        id: requestId,
        ...(filterUserId && { requesterUserId: filterUserId }),
      }
    });

    if (!analysisRequest) {
      return res.status(404).json({
        success: false,
        error: 'Analisis no encontrado'
      });
    }

    // Obtener mensajes de chat
    const messages = await prisma.analysisMessage.findMany({
      where: { analysisRequestId: requestId },
      orderBy: { dateTimeRegistration: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        dateTimeRegistration: true
      }
    });

    return res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error en getMessages:', error);
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
  translate,
  recommend,
  compare,
  generateObjections,
  getHistory,
  getById,
  getByEvidence,
  search,
  chat,
  saveAnalysis,
  getMessages
};
