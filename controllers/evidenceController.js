// =====================================================
// SISTEMA IRIS - Evidence Controller
// Controlador de Evidencias
// =====================================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const evidenceModel = require('../models/evidenceModel');
const response = require('../utils/responseHelper');
const { extractRequestInfo, logAudit } = require('../utils/auditLogger');
const { validationResult } = require('express-validator');
const storageService = require('../services/storageService');

/**
 * Crear una evidencia de tipo archivo (upload)
 * POST /api/evidences/file
 */
async function createFile(req, res) {
  let finalStoragePath = null;
  let s3Path = null;

  try {
    // Verificar errores de validacion
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return response.validationError(res, errors.array());
    }

    // Verificar que se haya subido un archivo
    if (!req.file) {
      return response.error(res, 'No se ha proporcionado un archivo', 400);
    }

    finalStoragePath = req.file.path;
    const userId = req.user.id;
    const { title, tipoEvidencia, notes } = req.body;
    const requestInfo = extractRequestInfo(req);

    // Calcular checksum SHA256 del archivo
    let checksumSha256 = null;
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      checksumSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (hashError) {
      console.error('[EvidenceController] Error calculando checksum:', hashError);
    }

    // Crear la evidencia base
    const evidence = await evidenceModel.createEvidence(
      userId,
      {
        evidenceType: 'FILE',
        title: title || req.file.originalname,
        tipoEvidencia,
        notes,
      },
      requestInfo
    );

    // Determinar storagePath segun provider
    let storagePath;

    if (storageService.useS3()) {
      // Subir a S3 con key: documents/{year}/{month}/ev{id}_{uuid}.ext
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const ext = path.extname(req.file.originalname).toLowerCase();
      const uniqueId = uuidv4().substring(0, 8);
      const s3Key = `documents/${year}/${month}/ev${evidence.id}_${uniqueId}${ext}`;

      s3Path = await storageService.upload(req.file.path, s3Key, {
        contentType: req.file.mimetype,
      });
      storagePath = s3Path;

      // Eliminar archivo temporal local
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignorar */ }
      finalStoragePath = null;
    } else {
      // Almacenamiento local: renombrar con evidenceId
      try {
        const currentDir = path.dirname(req.file.path);
        const currentFilename = path.basename(req.file.path);
        const newFilename = `ev${evidence.id}_${currentFilename}`;
        const newPath = path.join(currentDir, newFilename);

        fs.renameSync(req.file.path, newPath);
        finalStoragePath = newPath;
        storagePath = newPath;
      } catch (renameError) {
        console.error('[EvidenceController] Error renombrando archivo:', renameError);
        storagePath = finalStoragePath;
      }
    }

    // Crear el registro del archivo
    const evidenceFile = await evidenceModel.createEvidenceFile(
      evidence.id,
      {
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storagePath,
        checksumSha256,
      },
      userId
    );

    // Registrar upload en audit_log
    await logAudit({
      actorUserId: userId,
      actionCode: 'EVIDENCE_FILE_UPLOAD',
      entityType: 'EvidenceFile',
      entityId: evidenceFile.id,
      details: {
        evidenceId: evidence.id,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
      ipAddress: requestInfo.ipAddress,
      userAgent: requestInfo.userAgent,
    });

    // Obtener la evidencia completa
    const fullEvidence = await evidenceModel.getEvidenceById(evidence.id, userId);

    return response.created(res, fullEvidence, 'Archivo de evidencia creado exitosamente');
  } catch (error) {
    console.error('[EvidenceController] Error en createFile:', error);
    // Limpiar archivo local temporal si hubo error
    if (finalStoragePath && fs.existsSync(finalStoragePath)) {
      fs.unlink(finalStoragePath, () => {});
    } else if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
    // Limpiar S3 si ya se subio
    if (s3Path) {
      storageService.deleteFile(s3Path).catch(() => {});
    }
    return response.serverError(res, 'Error al crear la evidencia de archivo');
  }
}

/**
 * Crear una evidencia de tipo texto
 * POST /api/evidences/text
 */
async function createText(req, res) {
  try {
    // Verificar errores de validacion
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.validationError(res, errors.array());
    }

    const userId = req.user.id;
    const { title, textContent, tipoEvidencia, notes } = req.body;
    const requestInfo = extractRequestInfo(req);

    // Crear la evidencia base
    const evidence = await evidenceModel.createEvidence(
      userId,
      {
        evidenceType: 'TEXT',
        title: title || 'Texto sin titulo',
        tipoEvidencia,
        notes,
      },
      requestInfo
    );

    // Crear el registro de texto
    await evidenceModel.createEvidenceText(evidence.id, textContent, userId);

    // Registrar en audit_log
    await logAudit({
      actorUserId: userId,
      actionCode: 'EVIDENCE_TEXT_CREATE',
      entityType: 'EvidenceText',
      entityId: evidence.id,
      details: {
        evidenceId: evidence.id,
        title: title || 'Texto sin titulo',
        textLength: textContent.length,
      },
      ipAddress: requestInfo.ipAddress,
      userAgent: requestInfo.userAgent,
    });

    // Obtener la evidencia completa
    const fullEvidence = await evidenceModel.getEvidenceById(evidence.id, userId);

    return response.created(res, fullEvidence, 'Evidencia de texto creada exitosamente');
  } catch (error) {
    console.error('[EvidenceController] Error en createText:', error);
    return response.serverError(res, 'Error al crear la evidencia de texto');
  }
}

/**
 * Obtener todas las evidencias del usuario
 * GET /api/evidences
 */
async function getAll(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const { page, limit, search, type, caseId, sortBy, sortOrder } = req.query;

    const options = {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      search: search || '',
      type: type || '',
      caseId: caseId || null,
      sortBy: sortBy || 'dateTimeRegistration',
      sortOrder: sortOrder || 'desc',
    };

    const result = await evidenceModel.getEvidencesByUser(userId, options);

    return response.success(res, result, 'Evidencias obtenidas exitosamente');
  } catch (error) {
    console.error('[EvidenceController] Error en getAll:', error);
    return response.serverError(res, 'Error al obtener las evidencias');
  }
}

/**
 * Obtener una evidencia por ID
 * GET /api/evidences/:id
 */
async function getById(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const evidenceId = parseInt(req.params.id, 10);

    if (isNaN(evidenceId)) {
      return response.error(res, 'ID de evidencia invalido', 400);
    }

    const evidence = await evidenceModel.getEvidenceById(evidenceId, userId);

    if (!evidence) {
      return response.notFound(res, 'Evidencia no encontrada');
    }

    return response.success(res, evidence, 'Evidencia obtenida exitosamente');
  } catch (error) {
    console.error('[EvidenceController] Error en getById:', error);
    return response.serverError(res, 'Error al obtener la evidencia');
  }
}

/**
 * Obtener el contenido de una evidencia
 * GET /api/evidences/:id/content
 */
async function getContent(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const evidenceId = parseInt(req.params.id, 10);

    if (isNaN(evidenceId)) {
      return response.error(res, 'ID de evidencia invalido', 400);
    }

    const content = await evidenceModel.getEvidenceContent(evidenceId, userId);

    if (!content) {
      return response.notFound(res, 'Evidencia no encontrada o sin contenido');
    }

    // Si es archivo, enviar el archivo para descarga
    if (content.type === 'FILE') {
      const filePath = content.storagePath;

      // Verificar que el archivo existe (S3 o local)
      const fileExists = await storageService.exists(filePath);
      if (!fileExists) {
        return response.notFound(res, 'Archivo no encontrado en el sistema');
      }

      // Enviar archivo
      res.setHeader('Content-Type', content.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(content.originalFilename)}"`
      );

      const fileStream = await storageService.getStream(filePath);
      return fileStream.pipe(res);
    }

    // Si es texto, retornar el contenido
    if (content.type === 'TEXT') {
      return response.success(res, content, 'Contenido obtenido exitosamente');
    }

    return response.error(res, 'Tipo de evidencia no soportado', 400);
  } catch (error) {
    console.error('[EvidenceController] Error en getContent:', error);
    return response.serverError(res, 'Error al obtener el contenido');
  }
}

/**
 * Actualizar una evidencia
 * PUT /api/evidences/:id
 */
async function update(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.validationError(res, errors.array());
    }

    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const evidenceId = parseInt(req.params.id, 10);

    if (isNaN(evidenceId)) {
      return response.error(res, 'ID de evidencia invalido', 400);
    }

    const { title, tipoEvidencia, notes, textContent } = req.body;
    const requestInfo = extractRequestInfo(req);

    const updated = await evidenceModel.updateEvidence(
      evidenceId,
      { title, tipoEvidencia, notes, textContent },
      userId || req.user.id,
      requestInfo
    );

    if (!updated) {
      return response.notFound(res, 'Evidencia no encontrada');
    }

    return response.success(res, updated, 'Evidencia actualizada exitosamente');
  } catch (error) {
    console.error('[EvidenceController] Error en update:', error);
    return response.serverError(res, 'Error al actualizar la evidencia');
  }
}

/**
 * Crear un caso a partir de una evidencia
 * POST /api/evidences/:id/create-case
 */
async function createCaseFromEvidence(req, res) {
  try {
    // Verificar errores de validacion
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.validationError(res, errors.array());
    }

    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const evidenceId = parseInt(req.params.id, 10);

    if (isNaN(evidenceId)) {
      return response.error(res, 'ID de evidencia invalido', 400);
    }

    const { title, description, caseDate } = req.body;
    const requestInfo = extractRequestInfo(req);

    const result = await evidenceModel.createCaseFromEvidence(
      evidenceId,
      { title, description, caseDate },
      userId,
      requestInfo
    );

    if (result.error) {
      if (result.error === 'EVIDENCE_NOT_FOUND') {
        return response.notFound(res, 'Evidencia no encontrada');
      }
      return response.error(res, 'Error al crear el caso');
    }

    return response.created(res, result, 'Caso creado exitosamente desde la evidencia');
  } catch (error) {
    console.error('[EvidenceController] Error en createCaseFromEvidence:', error);
    return response.serverError(res, 'Error al crear el caso desde la evidencia');
  }
}

/**
 * Obtener conteo de evidencias del usuario
 * GET /api/evidences/count
 */
async function count(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const total = await evidenceModel.countEvidencesByUser(userId);

    return res.status(200).json({
      success: true,
      count: total,
    });
  } catch (error) {
    console.error('[EvidenceController] Error en count:', error);
    return response.serverError(res, 'Error al contar las evidencias');
  }
}

/**
 * Eliminar una evidencia
 * DELETE /api/evidences/:id
 */
async function deleteEvidence(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const evidenceId = parseInt(req.params.id, 10);

    if (isNaN(evidenceId)) {
      return response.error(res, 'ID de evidencia invalido', 400);
    }

    const requestInfo = extractRequestInfo(req);
    const deleted = await evidenceModel.deleteEvidence(evidenceId, userId, requestInfo);

    if (!deleted) {
      return response.notFound(res, 'Evidencia no encontrada');
    }

    // Limpiar archivo fisico (S3 o local) fuera de la transaccion
    if (deleted.fileInfo?.storagePath) {
      try {
        await storageService.deleteFile(deleted.fileInfo.storagePath);
      } catch (fileErr) {
        console.error('[EvidenceController] Error eliminando archivo fisico:', fileErr.message);
      }
    }

    return response.success(res, { id: evidenceId }, 'Evidencia eliminada exitosamente');
  } catch (error) {
    console.error('[EvidenceController] Error en deleteEvidence:', error);
    return response.serverError(res, 'Error al eliminar la evidencia');
  }
}

module.exports = {
  createFile,
  createText,
  getAll,
  getById,
  getContent,
  update,
  createCaseFromEvidence,
  count,
  deleteEvidence,
};
