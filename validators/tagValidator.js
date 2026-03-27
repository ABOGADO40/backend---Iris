// =====================================================
// SISTEMA IRIS - Tag Validators
// Validaciones para operaciones con etiquetas
// =====================================================

const { body, param, validationResult } = require('express-validator');

/**
 * Middleware para manejar errores de validacion
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Error de validacion',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

/**
 * Validaciones para crear etiqueta
 */
const createTagValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('El nombre de la etiqueta es requerido')
    .isLength({ min: 1, max: 60 })
    .withMessage('El nombre debe tener entre 1 y 60 caracteres'),
  body('color')
    .optional()
    .trim()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('El color debe estar en formato hexadecimal (#RRGGBB)'),
  handleValidationErrors,
];

/**
 * Validaciones para actualizar etiqueta
 */
const updateTagValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID de etiqueta invalido'),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('El nombre no puede estar vacio')
    .isLength({ min: 1, max: 60 })
    .withMessage('El nombre debe tener entre 1 y 60 caracteres'),
  body('color')
    .optional()
    .custom((value) => {
      // Permitir null para quitar el color
      if (value === null || value === '') return true;
      return /^#[0-9A-Fa-f]{6}$/.test(value);
    })
    .withMessage('El color debe estar en formato hexadecimal (#RRGGBB) o vacio'),
  handleValidationErrors,
];

/**
 * Validaciones para operaciones con ID de etiqueta
 */
const tagIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID de etiqueta invalido'),
  handleValidationErrors,
];

/**
 * Validaciones para asignar/remover etiqueta a caso
 */
const tagCaseValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID de etiqueta invalido'),
  param('caseId')
    .isInt({ min: 1 })
    .withMessage('ID de caso invalido'),
  handleValidationErrors,
];

/**
 * Validaciones para asignar/remover etiqueta a evidencia
 */
const tagEvidenceValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID de etiqueta invalido'),
  param('evidenceId')
    .isInt({ min: 1 })
    .withMessage('ID de evidencia invalido'),
  handleValidationErrors,
];

module.exports = {
  createTagValidation,
  updateTagValidation,
  tagIdValidation,
  tagCaseValidation,
  tagEvidenceValidation,
  handleValidationErrors,
};
