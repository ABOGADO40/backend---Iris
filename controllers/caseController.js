// =====================================================
// SISTEMA IRIS - Case Controller
// Controlador de Casos
// =====================================================

const path = require('path');
const fs = require('fs');
const caseModel = require('../models/caseModel');
const response = require('../utils/responseHelper');
const { extractRequestInfo } = require('../utils/auditLogger');
const { validationResult } = require('express-validator');
const { moveCaseFile, deleteCaseFile, getAbsolutePath } = require('../utils/caseFileHelper');
const storageService = require('../services/storageService');

/**
 * Crear un nuevo caso
 * POST /api/cases
 */
async function create(req, res) {
  let tempFile = null;
  try {
    // Verificar errores de validacion
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Limpiar archivo temporal si hay error de validacion
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignorar */ }
      }
      return response.validationError(res, errors.array());
    }

    const userId = req.user.id;
    const { title, description, caseDate } = req.body;
    const requestInfo = extractRequestInfo(req);
    tempFile = req.file || null;

    // Crear el caso en BD
    const newCase = await caseModel.createCase(
      userId,
      { title, description, caseDate },
      requestInfo
    );

    // Si hay archivo de descripcion, moverlo (S3 o local)
    if (tempFile) {
      const fileInfo = { name: tempFile.originalname, mime: tempFile.mimetype, size: tempFile.size };
      const relativePath = await moveCaseFile(tempFile.path, newCase.id, tempFile.originalname);
      tempFile = null; // Ya fue movido/subido, no limpiar en catch
      await caseModel.updateCaseFile(newCase.id, {
        descriptionFilePath: relativePath,
        descriptionFileName: fileInfo.name,
        descriptionFileMime: fileInfo.mime,
        descriptionFileSize: BigInt(fileInfo.size),
      });
      newCase.descriptionFilePath = relativePath;
      newCase.descriptionFileName = fileInfo.name;
      newCase.descriptionFileMime = fileInfo.mime;
      newCase.descriptionFileSize = BigInt(fileInfo.size);
    }

    return response.created(res, newCase, 'Caso creado exitosamente');
  } catch (error) {
    // Limpiar archivo temporal si hubo error
    if (tempFile) {
      try { fs.unlinkSync(tempFile.path); } catch (e) { /* ignorar */ }
    }
    console.error('[CaseController] Error en create:', error);
    return response.serverError(res, 'Error al crear el caso');
  }
}

/**
 * Obtener todos los casos del usuario
 * GET /api/cases
 */
async function getAll(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const { page, limit, search, sortBy, sortOrder, fechaDesde, fechaHasta } = req.query;

    const options = {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100), // Max 100 por pagina
      search: search || '',
      sortBy: sortBy || 'dateTimeRegistration',
      sortOrder: sortOrder || 'desc',
      fechaDesde: fechaDesde || null,
      fechaHasta: fechaHasta || null,
    };

    const result = await caseModel.getCasesByUser(userId, options);

    return response.success(res, result, 'Casos obtenidos exitosamente');
  } catch (error) {
    console.error('[CaseController] Error en getAll:', error);
    return response.serverError(res, 'Error al obtener los casos');
  }
}

/**
 * Obtener un caso por ID
 * GET /api/cases/:id
 */
async function getById(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const caseId = parseInt(req.params.id, 10);

    if (isNaN(caseId)) {
      return response.error(res, 'ID de caso invalido', 400);
    }

    const caseData = await caseModel.getCaseById(caseId, userId);

    if (!caseData) {
      return response.notFound(res, 'Caso no encontrado');
    }

    return response.success(res, caseData, 'Caso obtenido exitosamente');
  } catch (error) {
    console.error('[CaseController] Error en getById:', error);
    return response.serverError(res, 'Error al obtener el caso');
  }
}

/**
 * Actualizar un caso
 * PUT /api/cases/:id
 */
async function update(req, res) {
  let tempFile = null;
  try {
    // Verificar errores de validacion
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignorar */ }
      }
      return response.validationError(res, errors.array());
    }

    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const caseId = parseInt(req.params.id, 10);

    if (isNaN(caseId)) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignorar */ }
      }
      return response.error(res, 'ID de caso invalido', 400);
    }

    const { title, description, caseDate, removeFile } = req.body;
    const requestInfo = extractRequestInfo(req);
    tempFile = req.file || null;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (caseDate !== undefined) updateData.caseDate = caseDate;

    // Obtener caso actual para saber si tiene archivo previo
    const currentCase = await caseModel.getCaseById(caseId, userId);
    if (!currentCase) {
      if (tempFile) {
        try { fs.unlinkSync(tempFile.path); } catch (e) { /* ignorar */ }
      }
      return response.notFound(res, 'Caso no encontrado');
    }

    // Manejar archivo de descripcion
    if (tempFile) {
      // Eliminar archivo anterior si existe (S3 o local)
      if (currentCase.descriptionFilePath) {
        await deleteCaseFile(currentCase.descriptionFilePath);
      }
      const fileInfo = { name: tempFile.originalname, mime: tempFile.mimetype, size: tempFile.size };
      const relativePath = await moveCaseFile(tempFile.path, caseId, tempFile.originalname);
      tempFile = null;
      updateData.descriptionFilePath = relativePath;
      updateData.descriptionFileName = fileInfo.name;
      updateData.descriptionFileMime = fileInfo.mime;
      updateData.descriptionFileSize = BigInt(fileInfo.size);
    } else if (removeFile === 'true' || removeFile === true) {
      // Eliminar archivo sin reemplazar (S3 o local)
      if (currentCase.descriptionFilePath) {
        await deleteCaseFile(currentCase.descriptionFilePath);
      }
      updateData.descriptionFilePath = null;
      updateData.descriptionFileName = null;
      updateData.descriptionFileMime = null;
      updateData.descriptionFileSize = null;
    }

    if (Object.keys(updateData).length === 0) {
      return response.error(res, 'No se proporcionaron datos para actualizar', 400);
    }

    const updatedCase = await caseModel.updateCase(caseId, userId, updateData, requestInfo);

    if (!updatedCase) {
      return response.notFound(res, 'Caso no encontrado');
    }

    return response.success(res, updatedCase, 'Caso actualizado exitosamente');
  } catch (error) {
    if (tempFile) {
      try { fs.unlinkSync(tempFile.path); } catch (e) { /* ignorar */ }
    }
    console.error('[CaseController] Error en update:', error);
    return response.serverError(res, 'Error al actualizar el caso');
  }
}

/**
 * Adjuntar evidencia a un caso
 * POST /api/cases/:id/evidences
 */
async function attachEvidence(req, res) {
  try {
    // Verificar errores de validacion
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.validationError(res, errors.array());
    }

    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const caseId = parseInt(req.params.id, 10);

    if (isNaN(caseId)) {
      return response.error(res, 'ID de caso invalido', 400);
    }

    const { evidenceId } = req.body;
    const requestInfo = extractRequestInfo(req);

    const result = await caseModel.attachEvidence(caseId, evidenceId, userId, requestInfo);

    if (result.error) {
      switch (result.error) {
        case 'CASE_NOT_FOUND':
          return response.notFound(res, 'Caso no encontrado');
        case 'EVIDENCE_NOT_FOUND':
          return response.notFound(res, 'Evidencia no encontrada');
        case 'ALREADY_ATTACHED':
          return response.error(res, 'La evidencia ya esta adjunta a este caso', 409);
        default:
          return response.error(res, 'Error al adjuntar evidencia');
      }
    }

    return response.created(res, result, 'Evidencia adjuntada exitosamente');
  } catch (error) {
    console.error('[CaseController] Error en attachEvidence:', error);
    return response.serverError(res, 'Error al adjuntar la evidencia');
  }
}

/**
 * Desvincular evidencia de un caso
 * DELETE /api/cases/:id/evidences/:evidenceId
 */
async function detachEvidence(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const caseId = parseInt(req.params.id, 10);
    const evidenceId = parseInt(req.params.evidenceId, 10);

    if (isNaN(caseId) || isNaN(evidenceId)) {
      return response.error(res, 'IDs invalidos', 400);
    }

    const requestInfo = extractRequestInfo(req);

    const result = await caseModel.detachEvidence(caseId, evidenceId, userId, requestInfo);

    if (result.error) {
      switch (result.error) {
        case 'CASE_NOT_FOUND':
          return response.notFound(res, 'Caso no encontrado');
        case 'NOT_ATTACHED':
          return response.error(res, 'La evidencia no esta vinculada a este caso', 404);
        default:
          return response.error(res, 'Error al desvincular evidencia');
      }
    }

    return response.success(res, result, 'Evidencia desvinculada exitosamente');
  } catch (error) {
    console.error('[CaseController] Error en detachEvidence:', error);
    return response.serverError(res, 'Error al desvincular la evidencia');
  }
}

/**
 * Obtener evidencias de un caso
 * GET /api/cases/:id/evidences
 */
async function getEvidences(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const caseId = parseInt(req.params.id, 10);

    if (isNaN(caseId)) {
      return response.error(res, 'ID de caso invalido', 400);
    }

    const evidences = await caseModel.getCaseEvidences(caseId, userId);

    if (evidences === null) {
      return response.notFound(res, 'Caso no encontrado');
    }

    return response.success(res, evidences, 'Evidencias obtenidas exitosamente');
  } catch (error) {
    console.error('[CaseController] Error en getEvidences:', error);
    return response.serverError(res, 'Error al obtener las evidencias');
  }
}

/**
 * Obtener conteo de casos del usuario
 * GET /api/cases/count
 */
async function count(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const total = await caseModel.countCasesByUser(userId);

    return res.status(200).json({
      success: true,
      count: total,
    });
  } catch (error) {
    console.error('[CaseController] Error en count:', error);
    return response.serverError(res, 'Error al contar los casos');
  }
}

/**
 * Descargar archivo de descripcion de un caso
 * GET /api/cases/:id/description-file
 */
async function getDescriptionFile(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const caseId = parseInt(req.params.id, 10);

    if (isNaN(caseId)) {
      return response.error(res, 'ID de caso invalido', 400);
    }

    const caseData = await caseModel.getCaseById(caseId, userId);

    if (!caseData) {
      return response.notFound(res, 'Caso no encontrado');
    }

    if (!caseData.descriptionFilePath) {
      return response.notFound(res, 'Este caso no tiene archivo de descripcion');
    }

    // Verificar existencia (S3 o local)
    const fileExists = await storageService.exists(caseData.descriptionFilePath);
    if (!fileExists) {
      return response.notFound(res, 'Archivo no encontrado en el sistema');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(caseData.descriptionFileName || 'documento')}"`);
    if (caseData.descriptionFileMime) {
      res.setHeader('Content-Type', caseData.descriptionFileMime);
    }

    // Stream desde S3 o disco
    const fileStream = await storageService.getStream(caseData.descriptionFilePath);
    return fileStream.pipe(res);
  } catch (error) {
    console.error('[CaseController] Error en getDescriptionFile:', error);
    return response.serverError(res, 'Error al obtener el archivo');
  }
}

/**
 * Eliminar un caso (eliminacion logica)
 * DELETE /api/cases/:id
 */
async function deleteCase(req, res) {
  try {
    const userId = req.user.roleName === 'SUPER_ADMIN' ? null : req.user.id;
    const caseId = parseInt(req.params.id, 10);

    if (isNaN(caseId)) {
      return response.error(res, 'ID de caso invalido', 400);
    }

    const requestInfo = extractRequestInfo(req);

    const deleted = await caseModel.deleteCase(caseId, userId, requestInfo);
    if (!deleted) {
      return response.notFound(res, 'Caso no encontrado');
    }

    return response.success(res, { id: caseId }, 'Caso eliminado exitosamente');
  } catch (error) {
    console.error('[CaseController] Error en deleteCase:', error);
    return response.serverError(res, 'Error al eliminar el caso');
  }
}

module.exports = {
  create,
  getAll,
  getById,
  update,
  deleteCase,
  attachEvidence,
  detachEvidence,
  getEvidences,
  count,
  getDescriptionFile,
};
