// =====================================================
// SISTEMA IRIS - User Validators
// Validaciones para operaciones con usuarios
// =====================================================

const { body, param, query, validationResult } = require('express-validator');

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
 * Validaciones para crear usuario
 */
const createUserValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('El correo electronico es requerido')
    .isEmail()
    .withMessage('Debe ser un correo electronico valido')
    .isLength({ max: 160 })
    .withMessage('El correo no debe exceder 160 caracteres')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('La contrasena es requerida')
    .isLength({ min: 8, max: 128 })
    .withMessage('La contrasena debe tener entre 8 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contrasena debe contener al menos una mayuscula, una minuscula y un numero'),
  body('fullName')
    .optional()
    .trim()
    .isLength({ max: 160 })
    .withMessage('El nombre completo no debe exceder 160 caracteres'),
  body('roleId')
    .notEmpty()
    .withMessage('El rol es requerido')
    .isInt({ min: 1 })
    .withMessage('El rol debe ser un ID valido'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('El estado activo debe ser verdadero o falso'),
  handleValidationErrors,
];

/**
 * Validaciones para actualizar usuario
 */
const updateUserValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID de usuario invalido'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Debe ser un correo electronico valido')
    .isLength({ max: 160 })
    .withMessage('El correo no debe exceder 160 caracteres')
    .normalizeEmail(),
  body('password')
    .optional()
    .isLength({ min: 8, max: 128 })
    .withMessage('La contrasena debe tener entre 8 y 128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contrasena debe contener al menos una mayuscula, una minuscula y un numero'),
  body('fullName')
    .optional()
    .trim()
    .isLength({ max: 160 })
    .withMessage('El nombre completo no debe exceder 160 caracteres'),
  body('roleId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El rol debe ser un ID valido'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('El estado activo debe ser verdadero o falso'),
  handleValidationErrors,
];

/**
 * Validaciones para ID de usuario en parametro
 */
const userIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID de usuario invalido'),
  handleValidationErrors,
];

/**
 * Validaciones para listado de usuarios
 */
const listUsersValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El numero de pagina debe ser un entero positivo'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El limite debe ser un entero entre 1 y 100'),
  query('roleId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El ID de rol debe ser un entero positivo'),
  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('El estado activo debe ser true o false'),
  query('sortBy')
    .optional()
    .isIn(['id', 'email', 'fullName', 'dateTimeRegistration', 'roleId'])
    .withMessage('Campo de ordenamiento invalido'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Direccion de ordenamiento debe ser asc o desc'),
  handleValidationErrors,
];

module.exports = {
  createUserValidation,
  updateUserValidation,
  userIdValidation,
  listUsersValidation,
  handleValidationErrors,
};
