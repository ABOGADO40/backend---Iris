// =====================================================
// SISTEMA IRIS - Case Routes
// Rutas de Casos
// =====================================================

const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');
const { createCaseValidator, updateCaseValidator, attachEvidenceValidator } = require('../validators/caseValidator');
const { uploadCaseDocument, handleUploadError } = require('../middleware/uploadMiddleware');

// Nota: La autenticacion se maneja globalmente en index.js via globalAuthGuard

/**
 * POST /api/cases
 * Crear un nuevo caso
 */
router.post('/', uploadCaseDocument.single('descriptionFile'), handleUploadError, createCaseValidator, caseController.create);

/**
 * GET /api/cases
 * Listar casos del usuario autenticado
 * Query params: page, limit, search, sortBy, sortOrder
 */
router.get('/', caseController.getAll);

/**
 * GET /api/cases/count
 * Obtener conteo de casos del usuario
 * NOTA: Esta ruta debe ir ANTES de /:id para evitar conflictos
 */
router.get('/count', caseController.count);

/**
 * GET /api/cases/:id
 * Obtener detalle de un caso
 */
router.get('/:id', caseController.getById);

/**
 * PUT /api/cases/:id
 * Actualizar un caso
 */
router.put('/:id', uploadCaseDocument.single('descriptionFile'), handleUploadError, updateCaseValidator, caseController.update);

/**
 * DELETE /api/cases/:id
 * Eliminar un caso
 */
router.delete('/:id', caseController.deleteCase);

/**
 * GET /api/cases/:id/description-file
 * Descargar archivo de descripcion del caso
 */
router.get('/:id/description-file', caseController.getDescriptionFile);

/**
 * POST /api/cases/:id/evidences
 * Adjuntar una evidencia a un caso
 */
router.post('/:id/evidences', attachEvidenceValidator, caseController.attachEvidence);

/**
 * DELETE /api/cases/:id/evidences/:evidenceId
 * Desvincular una evidencia de un caso
 */
router.delete('/:id/evidences/:evidenceId', caseController.detachEvidence);

/**
 * GET /api/cases/:id/evidences
 * Listar evidencias de un caso
 */
router.get('/:id/evidences', caseController.getEvidences);

module.exports = router;
