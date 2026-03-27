// =====================================================
// SISTEMA IRIS - Evidence Routes
// Rutas de Evidencias
// =====================================================

const express = require('express');
const router = express.Router();
const evidenceController = require('../controllers/evidenceController');
const { uploadDocument } = require('../middleware/uploadMiddleware');
const {
  createFileValidator,
  createTextValidator,
  updateEvidenceValidator,
  createCaseFromEvidenceValidator,
} = require('../validators/evidenceValidator');

// Nota: La autenticacion se maneja globalmente en index.js via globalAuthGuard

/**
 * POST /api/evidences/file
 * Upload de archivo como evidencia
 * Soporta archivos hasta 2GB
 */
router.post('/file', uploadDocument.single('file'), createFileValidator, evidenceController.createFile);

/**
 * POST /api/evidences/text
 * Crear evidencia de texto pegado
 */
router.post('/text', createTextValidator, evidenceController.createText);

/**
 * GET /api/evidences
 * Listar evidencias del usuario autenticado
 * Query params: page, limit, search, type, sortBy, sortOrder
 */
router.get('/', evidenceController.getAll);

/**
 * GET /api/evidences/count
 * Obtener conteo de evidencias del usuario
 * NOTA: Esta ruta debe ir ANTES de /:id para evitar conflictos
 */
router.get('/count', evidenceController.count);

/**
 * GET /api/evidences/:id
 * Obtener detalle de una evidencia
 */
router.get('/:id', evidenceController.getById);

/**
 * PUT /api/evidences/:id
 * Actualizar datos de una evidencia
 */
router.put('/:id', updateEvidenceValidator, evidenceController.update);

/**
 * GET /api/evidences/:id/content
 * Obtener contenido de la evidencia (descarga archivo o texto)
 */
router.get('/:id/content', evidenceController.getContent);

/**
 * DELETE /api/evidences/:id
 * Eliminar una evidencia y todos sus datos relacionados
 */
router.delete('/:id', evidenceController.deleteEvidence);

/**
 * POST /api/evidences/:id/create-case
 * Crear un caso a partir de una evidencia existente
 */
router.post('/:id/create-case', createCaseFromEvidenceValidator, evidenceController.createCaseFromEvidence);

module.exports = router;
