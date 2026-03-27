// =====================================================
// SISTEMA IRIS - Case Validator
// Validaciones para endpoints de Casos
// =====================================================

const { body } = require('express-validator');

/**
 * Validador para crear caso
 * POST /api/cases
 */
const createCaseValidator = [
  body('title')
    .notEmpty()
    .withMessage('El titulo es obligatorio')
    .isString()
    .withMessage('El titulo debe ser texto')
    .isLength({ min: 3, max: 200 })
    .withMessage('El titulo debe tener entre 3 y 200 caracteres')
    .trim(),

  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('La descripcion debe ser texto')
    .isLength({ max: 10000 })
    .withMessage('La descripcion no puede exceder 10000 caracteres')
    .trim(),

  body('caseDate')
    .notEmpty()
    .withMessage('La fecha del caso es obligatoria')
    .isISO8601()
    .withMessage('La fecha debe estar en formato ISO8601 (YYYY-MM-DD)')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      // Permitir fechas hasta 100 anos en el pasado y 1 ano en el futuro
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 100);
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);

      if (date < minDate || date > maxDate) {
        throw new Error('La fecha debe estar en un rango valido');
      }
      return true;
    }),
];

/**
 * Validador para actualizar caso
 * PUT /api/cases/:id
 */
const updateCaseValidator = [
  body('title')
    .optional()
    .isString()
    .withMessage('El titulo debe ser texto')
    .isLength({ min: 3, max: 200 })
    .withMessage('El titulo debe tener entre 3 y 200 caracteres')
    .trim(),

  body('description')
    .optional({ nullable: true })
    .isString()
    .withMessage('La descripcion debe ser texto')
    .isLength({ max: 10000 })
    .withMessage('La descripcion no puede exceder 10000 caracteres')
    .trim(),

  body('caseDate')
    .optional()
    .isISO8601()
    .withMessage('La fecha debe estar en formato ISO8601 (YYYY-MM-DD)')
    .custom((value) => {
      if (!value) return true;
      const date = new Date(value);
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 100);
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);

      if (date < minDate || date > maxDate) {
        throw new Error('La fecha debe estar en un rango valido');
      }
      return true;
    }),
];

/**
 * Validador para adjuntar evidencia a caso
 * POST /api/cases/:id/evidences
 */
const attachEvidenceValidator = [
  body('evidenceId')
    .notEmpty()
    .withMessage('El ID de evidencia es obligatorio')
    .isInt({ min: 1 })
    .withMessage('El ID de evidencia debe ser un numero entero positivo')
    .toInt(),
];

module.exports = {
  createCaseValidator,
  updateCaseValidator,
  attachEvidenceValidator,
};
