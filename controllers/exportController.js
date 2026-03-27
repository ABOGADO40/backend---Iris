// =====================================================
// SISTEMA IRIS - Export Controller
// Controlador para exportaciones
// =====================================================

const prisma = require('../config/prisma');
const fs = require('fs');
const path = require('path');

const exportService = require('../services/exportService');
const exportModel = require('../models/exportModel');
const storageService = require('../services/storageService');

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

/**
 * Obtiene el content type para un formato
 */
function getContentType(format) {
  const contentTypes = {
    PDF: 'application/pdf',
    DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  return contentTypes[format.toUpperCase()] || 'application/octet-stream';
}

// =====================================================
// CREAR EXPORTACION
// =====================================================

/**
 * POST /api/exports
 * Genera una nueva exportacion
 */
async function create(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const { resultId, format, chatMessages } = req.body;

    // Validar formato
    const validFormats = ['PDF', 'DOCX', 'PPTX'];
    const normalizedFormat = (format || '').toUpperCase();

    if (!validFormats.includes(normalizedFormat)) {
      return res.status(400).json({
        success: false,
        error: `Formato invalido. Formatos soportados: ${validFormats.join(', ')}`
      });
    }

    // Validar resultId
    if (!resultId || typeof resultId !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'resultId es requerido y debe ser un numero'
      });
    }

    // Verificar acceso al resultado
    const analysisResult = await exportModel.getResultWithRequest(resultId, userId);

    if (!analysisResult) {
      return res.status(404).json({
        success: false,
        error: 'Resultado de analisis no encontrado o sin acceso'
      });
    }

    // Solo reutilizar exportaciones existentes si NO hay mensajes de chat
    // (los mensajes de chat hacen que cada exportacion sea unica)
    if (!chatMessages || chatMessages.length === 0) {
      const existingExports = await exportModel.getExportsByResult(resultId);
      const existingExport = existingExports.find(e => e.format === normalizedFormat);

      if (existingExport) {
        // Verificar que el archivo aun existe (S3 o local)
        const exportFileExists = await storageService.exists(existingExport.storagePath);
        if (exportFileExists) {
          await logAudit(userId, 'EXPORT_REUSE', 'Export', existingExport.id, {
            resultId,
            format: normalizedFormat
          }, req);

          return res.status(200).json({
            success: true,
            data: {
              exportId: existingExport.id,
              format: existingExport.format,
              fileSize: existingExport.fileSizeBytes,
              downloadCount: existingExport.downloadCount,
              createdAt: existingExport.dateTimeRegistration,
              message: 'Exportacion existente reutilizada'
            }
          });
        }
        // Si el archivo no existe, continuar para crear uno nuevo
      }
    }

    // Generar exportacion segun formato
    let exportResult;

    try {
      // Pasar mensajes de chat si estan disponibles
      const validChatMessages = Array.isArray(chatMessages) ? chatMessages : null;

      switch (normalizedFormat) {
        case 'PDF':
          exportResult = await exportService.generatePDF(analysisResult, undefined, validChatMessages);
          break;
        case 'DOCX':
          exportResult = await exportService.generateDOCX(analysisResult, undefined, validChatMessages);
          break;
        case 'PPTX':
          exportResult = await exportService.generatePPTX(analysisResult);
          break;
        default:
          throw new Error(`Formato no soportado: ${normalizedFormat}`);
      }
    } catch (genError) {
      console.error('Error generando exportacion:', genError);
      console.error('Stack:', genError.stack);
      console.error('AnalysisResult recibido:', JSON.stringify(analysisResult, null, 2));

      await logAudit(userId, 'EXPORT_GENERATION_FAILED', 'AnalysisResult', resultId, {
        format: normalizedFormat,
        error: genError.message
      }, req);

      return res.status(500).json({
        success: false,
        error: 'Error al generar la exportacion',
        details: genError.message
      });
    }

    // Crear registro en base de datos
    const exportRecord = await exportModel.createExport(
      resultId,
      normalizedFormat,
      exportResult.filePath,
      exportResult.fileSize,
      userId
    );

    // Audit log
    await logAudit(userId, 'EXPORT_CREATED', 'Export', exportRecord.id, {
      resultId,
      format: normalizedFormat,
      fileName: exportResult.fileName,
      fileSize: exportResult.fileSize
    }, req);

    return res.status(201).json({
      success: true,
      data: {
        exportId: exportRecord.id,
        format: exportRecord.format,
        fileName: exportResult.fileName,
        fileSize: exportRecord.fileSizeBytes,
        downloadCount: exportRecord.downloadCount,
        createdAt: exportRecord.dateTimeRegistration
      }
    });
  } catch (error) {
    console.error('Error en create export:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// DESCARGAR EXPORTACION
// =====================================================

/**
 * GET /api/exports/:id/download
 * Descarga un archivo exportado
 */
async function download(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const exportId = parseInt(req.params.id);

    if (isNaN(exportId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de exportacion invalido'
      });
    }

    // Obtener exportacion con validacion de acceso
    const exportRecord = await exportModel.getExportById(exportId, userId);

    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: 'Exportacion no encontrada o sin acceso'
      });
    }

    // Verificar que el archivo existe (S3 o local)
    const exportFileExists = await storageService.exists(exportRecord.storagePath);
    if (!exportFileExists) {
      await logAudit(userId, 'EXPORT_FILE_NOT_FOUND', 'Export', exportId, {
        storagePath: exportRecord.storagePath
      }, req);

      return res.status(404).json({
        success: false,
        error: 'El archivo de exportacion no se encuentra disponible. Por favor, genere una nueva exportacion.'
      });
    }

    // Incrementar contador de descargas
    await exportModel.incrementDownloadCount(exportId, userId);

    // Audit log
    await logAudit(userId, 'EXPORT_DOWNLOADED', 'Export', exportId, {
      format: exportRecord.format,
      fileSize: exportRecord.fileSizeBytes
    }, req);

    // Configurar headers para descarga
    const fileName = storageService.isS3Path(exportRecord.storagePath)
      ? path.basename(storageService.getS3Key(exportRecord.storagePath))
      : path.basename(exportRecord.storagePath);
    const contentType = getContentType(exportRecord.format);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', exportRecord.fileSizeBytes);

    // Enviar archivo (S3 o local)
    const fileStream = await storageService.getStream(exportRecord.storagePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error al enviar el archivo'
        });
      }
    });
  } catch (error) {
    console.error('Error en download:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
}

// =====================================================
// LISTAR EXPORTACIONES POR RESULTADO
// =====================================================

/**
 * GET /api/exports/result/:resultId
 * Obtiene todas las exportaciones de un resultado
 */
async function getByResult(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const resultId = parseInt(req.params.resultId);

    if (isNaN(resultId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de resultado invalido'
      });
    }

    // Verificar acceso al resultado
    const hasAccess = await exportModel.userHasAccessToResult(resultId, userId);

    if (!hasAccess) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado o sin acceso'
      });
    }

    // Obtener exportaciones
    const exports = await exportModel.getExportsByResult(resultId);

    // Verificar disponibilidad de archivos (S3 o local)
    const exportsWithAvailability = [];
    for (const exp of exports) {
      const fileAvailable = await storageService.exists(exp.storagePath);
      exportsWithAvailability.push({ ...exp, fileAvailable });
    }

    // Audit log
    await logAudit(userId, 'EXPORTS_LIST_VIEW', 'AnalysisResult', resultId, {
      exportCount: exports.length
    }, req);

    return res.status(200).json({
      success: true,
      data: exportsWithAvailability
    });
  } catch (error) {
    console.error('Error en getByResult:', error);
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
  create,
  download,
  getByResult
};
