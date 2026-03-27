// =====================================================
// SISTEMA IRIS - AI Config Routes
// Rutas para configuracion de servicios IA
// Solo accesible por SUPER_ADMIN
// =====================================================

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');

const aiConfigController = require('../controllers/aiConfigController');

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
// MIDDLEWARE DE AUTORIZACION SUPER_ADMIN
// =====================================================

const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.roleName !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Se requiere rol de superadministrador.'
    });
  }
  next();
};

// =====================================================
// VALIDADORES
// =====================================================

const serviceTypeValidation = [
  param('serviceType')
    .isIn(['TRANSLATE', 'RECOMMEND', 'COMPARE', 'OBJECTIONS'])
    .withMessage('serviceType debe ser TRANSLATE, RECOMMEND, COMPARE u OBJECTIONS')
];

const updateValidation = [
  body('apiKey')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('apiKey debe tener maximo 500 caracteres'),
  body('apiUrl')
    .optional()
    .isURL()
    .withMessage('apiUrl debe ser una URL valida'),
  body('aiModel')
    .optional()
    .isString()
    .isLength({ max: 80 })
    .withMessage('aiModel debe tener maximo 80 caracteres'),
  body('maxTokens')
    .optional()
    .isInt({ min: 100, max: 100000 })
    .withMessage('maxTokens debe ser un entero entre 100 y 100000'),
  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('temperature debe ser un numero entre 0 y 2'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive debe ser un booleano'),
  body('serviceName')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('serviceName debe tener maximo 100 caracteres'),
  body('serviceDescription')
    .optional()
    .isString()
    .isLength({ max: 300 })
    .withMessage('serviceDescription debe tener maximo 300 caracteres')
];

// =====================================================
// RUTAS
// =====================================================

// Todas las rutas requieren SUPER_ADMIN
router.use(requireSuperAdmin);

/**
 * GET /api/ai-config
 * Obtener todas las configuraciones de servicios IA
 */
router.get('/', aiConfigController.getAll);

/**
 * GET /api/ai-config/:serviceType
 * Obtener configuracion de un servicio especifico
 */
router.get(
  '/:serviceType',
  serviceTypeValidation,
  handleValidationErrors,
  aiConfigController.getByServiceType
);

/**
 * GET /api/ai-config/:serviceType/status
 * Verificar estado de un servicio
 */
router.get(
  '/:serviceType/status',
  serviceTypeValidation,
  handleValidationErrors,
  aiConfigController.checkStatus
);

/**
 * PATCH /api/ai-config/:serviceType
 * Actualizar configuracion de un servicio
 */
router.patch(
  '/:serviceType',
  serviceTypeValidation,
  updateValidation,
  handleValidationErrors,
  aiConfigController.update
);

/**
 * POST /api/ai-config/:serviceType/test
 * Probar conexion con el servicio de IA
 */
router.post(
  '/:serviceType/test',
  serviceTypeValidation,
  handleValidationErrors,
  aiConfigController.testConnection
);

/**
 * GET /api/ai-config/:serviceType/variables
 * Obtener variables de prompt configuradas para un servicio
 */
router.get(
  '/:serviceType/variables',
  serviceTypeValidation,
  handleValidationErrors,
  aiConfigController.getVariables
);

// Las variables de prompt son de solo lectura (informativas)
// No se permiten operaciones de escritura (PUT/POST/DELETE) sobre variables

// =====================================================
// EXPORTS
// =====================================================

module.exports = router;
