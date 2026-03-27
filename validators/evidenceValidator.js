// =====================================================
// SISTEMA IRIS - Evidence Validator
// Validaciones para endpoints de Evidencias
// =====================================================

const { body } = require('express-validator');

/**
 * Lista de tipos de evidencia permitidos
 */
const TIPOS_EVIDENCIA = [
  'FOTOGRAFIA',
  'VIDEO',
  'AUDIO',
  'DOCUMENTAL',
  'PERITAJE',
  'OTRO',
];

/**
 * Validador para crear evidencia de archivo
 * POST /api/evidences/file
 * Nota: La validacion del archivo se hace en el middleware de multer
 */
const createFileValidator = [
  body('title')
    .optional({ nullable: true })
    .isString()
    .withMessage('El titulo debe ser texto')
    .isLength({ max: 200 })
    .withMessage('El titulo no puede exceder 200 caracteres')
    .trim(),

  body('tipoEvidencia')
    .optional({ nullable: true })
    .isString()
    .withMessage('El tipo de evidencia debe ser texto')
    .isLength({ max: 120 })
    .withMessage('El tipo de evidencia no puede exceder 120 caracteres')
    .trim(),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('Las notas deben ser texto')
    .isLength({ max: 5000 })
    .withMessage('Las notas no pueden exceder 5000 caracteres')
    .trim(),
];

/**
 * Validador para crear evidencia de texto
 * POST /api/evidences/text
 */
const createTextValidator = [
  body('title')
    .optional({ nullable: true })
    .isString()
    .withMessage('El titulo debe ser texto')
    .isLength({ max: 200 })
    .withMessage('El titulo no puede exceder 200 caracteres')
    .trim(),

  body('textContent')
    .notEmpty()
    .withMessage('El contenido de texto es obligatorio')
    .isString()
    .withMessage('El contenido debe ser texto')
    .isLength({ min: 1, max: 5000000 }) // Hasta 5MB de texto aprox
    .withMessage('El contenido debe tener entre 1 y 5,000,000 caracteres'),

  body('tipoEvidencia')
    .optional({ nullable: true })
    .isString()
    .withMessage('El tipo de evidencia debe ser texto')
    .isLength({ max: 120 })
    .withMessage('El tipo de evidencia no puede exceder 120 caracteres')
    .trim(),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('Las notas deben ser texto')
    .isLength({ max: 5000 })
    .withMessage('Las notas no pueden exceder 5000 caracteres')
    .trim(),
];

/**
 * Validador para actualizar evidencia
 * PUT /api/evidences/:id
 */
const updateEvidenceValidator = [
  body('title')
    .optional({ nullable: true })
    .isString()
    .withMessage('El titulo debe ser texto')
    .isLength({ max: 200 })
    .withMessage('El titulo no puede exceder 200 caracteres')
    .trim(),

  body('tipoEvidencia')
    .optional({ nullable: true })
    .isString()
    .withMessage('El tipo de evidencia debe ser texto')
    .isLength({ max: 120 })
    .withMessage('El tipo de evidencia no puede exceder 120 caracteres')
    .trim(),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('Las notas deben ser texto')
    .isLength({ max: 5000 })
    .withMessage('Las notas no pueden exceder 5000 caracteres')
    .trim(),

  body('textContent')
    .optional({ nullable: true })
    .isString()
    .withMessage('El contenido debe ser texto')
    .isLength({ max: 5000000 })
    .withMessage('El contenido no puede exceder 5,000,000 caracteres'),
];

/**
 * Validador para crear caso desde evidencia
 * POST /api/evidences/:id/create-case
 */
const createCaseFromEvidenceValidator = [
  body('title')
    .notEmpty()
    .withMessage('El titulo del caso es obligatorio')
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

module.exports = {
  createFileValidator,
  createTextValidator,
  updateEvidenceValidator,
  createCaseFromEvidenceValidator,
  TIPOS_EVIDENCIA,
};
