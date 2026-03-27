// =====================================================
// SISTEMA IRIS - Export Routes
// Rutas para exportaciones
// =====================================================

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');

const exportController = require('../controllers/exportController');

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

const createExportValidation = [
  body('resultId')
    .notEmpty()
    .withMessage('resultId es requerido')
    .isInt({ min: 1 })
    .withMessage('resultId debe ser un numero entero positivo')
    .toInt(),
  body('format')
    .notEmpty()
    .withMessage('format es requerido')
    .isIn(['PDF', 'DOCX', 'PPTX', 'pdf', 'docx', 'pptx'])
    .withMessage('format debe ser PDF, DOCX o PPTX')
];

const exportIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id debe ser un numero entero positivo')
    .toInt()
];

const resultIdValidation = [
  param('resultId')
    .isInt({ min: 1 })
    .withMessage('resultId debe ser un numero entero positivo')
    .toInt()
];

// =====================================================
// RUTAS
// =====================================================

/**
 * POST /api/exports
 * Crea una nueva exportacion
 * Body: { resultId: number, format: 'PDF' | 'DOCX' | 'PPTX' }
 */
router.post(
  '/',
  createExportValidation,
  handleValidationErrors,
  exportController.create
);

/**
 * GET /api/exports/:id/download
 * Descarga un archivo exportado
 */
router.get(
  '/:id/download',
  exportIdValidation,
  handleValidationErrors,
  exportController.download
);

/**
 * GET /api/exports/result/:resultId
 * Obtiene todas las exportaciones de un resultado
 */
router.get(
  '/result/:resultId',
  resultIdValidation,
  handleValidationErrors,
  exportController.getByResult
);

// =====================================================
// EXPORTS
// =====================================================

module.exports = router;
