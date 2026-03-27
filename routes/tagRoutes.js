// =====================================================
// SISTEMA IRIS - Tag Routes
// Rutas para gestion de etiquetas
// =====================================================

const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagController');
const {
  createTagValidation,
  updateTagValidation,
  tagIdValidation,
  tagCaseValidation,
  tagEvidenceValidation,
} = require('../validators/tagValidator');

// Nota: La autenticacion se maneja globalmente en index.js via globalAuthGuard

// =====================================================
// RUTAS CRUD DE ETIQUETAS
// =====================================================

/**
 * @route   POST /api/tags
 * @desc    Crear una nueva etiqueta
 * @access  Private
 */
router.post('/', createTagValidation, tagController.create);

/**
 * @route   GET /api/tags
 * @desc    Obtener todas las etiquetas del usuario
 * @access  Private
 */
router.get('/', tagController.getAll);

/**
 * @route   GET /api/tags/:id
 * @desc    Obtener una etiqueta por ID
 * @access  Private
 */
router.get('/:id', tagIdValidation, tagController.getById);

/**
 * @route   PUT /api/tags/:id
 * @desc    Actualizar una etiqueta
 * @access  Private
 */
router.put('/:id', updateTagValidation, tagController.update);

/**
 * @route   DELETE /api/tags/:id
 * @desc    Eliminar una etiqueta
 * @access  Private
 */
router.delete('/:id', tagIdValidation, tagController.delete);

// =====================================================
// RUTAS DE ASIGNACION A CASOS
// =====================================================

/**
 * @route   POST /api/tags/:id/case/:caseId
 * @desc    Asignar una etiqueta a un caso
 * @access  Private
 */
router.post('/:id/case/:caseId', tagCaseValidation, tagController.assignToCase);

/**
 * @route   DELETE /api/tags/:id/case/:caseId
 * @desc    Remover una etiqueta de un caso
 * @access  Private
 */
router.delete('/:id/case/:caseId', tagCaseValidation, tagController.removeFromCase);

/**
 * @route   GET /api/tags/:id/cases
 * @desc    Obtener todos los casos con una etiqueta
 * @access  Private
 */
router.get('/:id/cases', tagIdValidation, tagController.getCasesByTag);

// =====================================================
// RUTAS DE ASIGNACION A EVIDENCIAS
// =====================================================

/**
 * @route   POST /api/tags/:id/evidence/:evidenceId
 * @desc    Asignar una etiqueta a una evidencia
 * @access  Private
 */
router.post('/:id/evidence/:evidenceId', tagEvidenceValidation, tagController.assignToEvidence);

/**
 * @route   DELETE /api/tags/:id/evidence/:evidenceId
 * @desc    Remover una etiqueta de una evidencia
 * @access  Private
 */
router.delete('/:id/evidence/:evidenceId', tagEvidenceValidation, tagController.removeFromEvidence);

/**
 * @route   GET /api/tags/:id/evidences
 * @desc    Obtener todas las evidencias con una etiqueta
 * @access  Private
 */
router.get('/:id/evidences', tagIdValidation, tagController.getEvidencesByTag);

module.exports = router;
