// =====================================================
// SISTEMA IRIS - Analysis Routes
// Rutas para analisis de IA
// Soporta upload de imagenes para Vision API
// =====================================================

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');

const analysisController = require('../controllers/analysisController');
const { uploadAnalysisFiles, handleMulterError, cleanupTempImages } = require('../middleware/imageUploadMiddleware');

// Nota: La autenticacion se maneja globalmente en index.js via globalAuthGuard

// =====================================================
// MIDDLEWARE DE VALIDACION
// =====================================================

const handleValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Errores de validacion',
      details: errors.array()
    });
  }
  next();
};

// =====================================================
// VALIDADORES
// =====================================================

// Validacion comun: caseId obligatorio + evidenceIds opcional
const caseRequiredValidation = [
  body('caseId')
    .notEmpty()
    .withMessage('caseId es obligatorio')
    .isInt({ min: 1 })
    .withMessage('caseId debe ser un numero entero positivo'),
  body('evidenceIds')
    .optional()
    .isArray()
    .withMessage('evidenceIds debe ser un array'),
  body('evidenceIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Cada evidenceId debe ser un numero entero positivo')
];

const historyValidation = [
  query('serviceType')
    .optional()
    .isIn(['TRANSLATE', 'RECOMMEND', 'COMPARE', 'OBJECTIONS'])
    .withMessage('serviceType debe ser TRANSLATE, RECOMMEND, COMPARE u OBJECTIONS'),
  query('status')
    .optional()
    .isIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
    .withMessage('status debe ser PENDING, PROCESSING, COMPLETED o FAILED'),
  query('caseId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('caseId debe ser un numero entero positivo'),
  query('fromDate')
    .optional()
    .isISO8601()
    .withMessage('fromDate debe ser una fecha ISO8601 valida'),
  query('toDate')
    .optional()
    .isISO8601()
    .withMessage('toDate debe ser una fecha ISO8601 valida'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page debe ser un numero entero positivo'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit debe ser un numero entre 1 y 100')
];

const searchValidation = [
  query('q')
    .notEmpty()
    .isString()
    .isLength({ min: 3, max: 200 })
    .withMessage('q debe tener entre 3 y 200 caracteres'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page debe ser un numero entero positivo'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit debe ser un numero entre 1 y 100')
];

const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id debe ser un numero entero positivo')
];

const evidenceIdValidation = [
  param('evidenceId')
    .isInt({ min: 1 })
    .withMessage('evidenceId debe ser un numero entero positivo')
];

// =====================================================
// RUTAS
// =====================================================

/**
 * POST /api/analysis/translate
 * FLW-100: Traducir peritaje a lenguaje comun
 * Requiere caseId, acepta evidenceIds + archivos (campo 'files')
 */
router.post(
  '/translate',
  uploadAnalysisFiles.array('files', 10),
  handleMulterError,
  cleanupTempImages,
  caseRequiredValidation,
  handleValidationErrors,
  analysisController.translate
);

/**
 * POST /api/analysis/recommend
 * FLW-110: Recomendar tipos de peritajes
 * Requiere caseId, acepta evidenceIds + archivos (campo 'files')
 */
router.post(
  '/recommend',
  uploadAnalysisFiles.array('files', 10),
  handleMulterError,
  cleanupTempImages,
  caseRequiredValidation,
  handleValidationErrors,
  analysisController.recommend
);

/**
 * POST /api/analysis/compare
 * FLW-120: Comparar dos peritajes
 * Requiere caseId + min 2 evidenceIds, acepta archivos (campo 'files')
 */
router.post(
  '/compare',
  uploadAnalysisFiles.array('files', 10),
  handleMulterError,
  cleanupTempImages,
  caseRequiredValidation,
  handleValidationErrors,
  analysisController.compare
);

/**
 * POST /api/analysis/objections
 * FLW-130: Generar objeciones tecnicas
 * Requiere caseId, acepta evidenceIds + archivos (campo 'files')
 */
router.post(
  '/objections',
  uploadAnalysisFiles.array('files', 10),
  handleMulterError,
  cleanupTempImages,
  caseRequiredValidation,
  handleValidationErrors,
  analysisController.generateObjections
);

/**
 * GET /api/analysis/search
 * Busqueda full-text en resultados
 * NOTA: Esta ruta debe ir ANTES de /:id para evitar conflictos
 */
router.get(
  '/search',
  searchValidation,
  handleValidationErrors,
  analysisController.search
);

/**
 * GET /api/analysis/history
 * FLW-200: Obtener historial de analisis
 */
router.get(
  '/history',
  historyValidation,
  handleValidationErrors,
  analysisController.getHistory
);

/**
 * GET /api/analysis/by-evidence/:evidenceId
 * Obtener todos los analisis de una evidencia especifica
 */
router.get(
  '/by-evidence/:evidenceId',
  evidenceIdValidation,
  handleValidationErrors,
  analysisController.getByEvidence
);

/**
 * GET /api/analysis/:id
 * Obtener un analisis especifico por ID
 */
router.get(
  '/:id',
  idValidation,
  handleValidationErrors,
  analysisController.getById
);

/**
 * POST /api/analysis/:id/chat
 * Continuar conversacion con el analisis
 */
router.post(
  '/:id/chat',
  idValidation,
  [
    body('message')
      .notEmpty()
      .isString()
      .isLength({ min: 1, max: 10000 })
      .withMessage('El mensaje debe tener entre 1 y 10000 caracteres')
  ],
  handleValidationErrors,
  analysisController.chat
);

/**
 * PATCH /api/analysis/:id/save
 * Guardar un analisis con titulo
 */
router.patch(
  '/:id/save',
  idValidation,
  [
    body('title')
      .optional()
      .isString()
      .isLength({ max: 200 })
      .withMessage('El titulo debe tener maximo 200 caracteres')
  ],
  handleValidationErrors,
  analysisController.saveAnalysis
);

/**
 * GET /api/analysis/:id/messages
 * Obtener mensajes de chat de un analisis
 */
router.get(
  '/:id/messages',
  idValidation,
  handleValidationErrors,
  analysisController.getMessages
);

// =====================================================
// EXPORTS
// =====================================================

module.exports = router;
