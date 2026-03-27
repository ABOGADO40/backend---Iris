// =====================================================
// SISTEMA IRIS - User Routes
// Rutas para gestion administrativa de usuarios
// Todas las rutas requieren rol SUPER_ADMIN
// =====================================================

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const emailVerificationController = require('../controllers/emailVerificationController');
const { requireSuperAdmin } = require('../middleware/authMiddleware');
const {
  createUserValidation,
  updateUserValidation,
  userIdValidation,
  listUsersValidation,
} = require('../validators/userValidator');

// Nota: La autenticacion se maneja globalmente en index.js via globalAuthGuard
// Solo se requiere verificacion adicional de rol SUPER_ADMIN
router.use(requireSuperAdmin);

// =====================================================
// RUTAS DE UTILIDAD (antes de las rutas con parametros)
// =====================================================

/**
 * @route   GET /api/users/roles
 * @desc    Obtener todos los roles disponibles
 * @access  SUPER_ADMIN only
 */
router.get('/roles', userController.getRoles);

/**
 * @route   GET /api/users/stats
 * @desc    Obtener estadisticas de usuarios
 * @access  SUPER_ADMIN only
 */
router.get('/stats', userController.getStats);

// =====================================================
// RUTAS CRUD DE USUARIOS
// =====================================================

/**
 * @route   GET /api/users
 * @desc    Obtener todos los usuarios con paginacion y filtros
 * @access  SUPER_ADMIN only
 * @query   page - Numero de pagina (default: 1)
 * @query   limit - Registros por pagina (default: 20, max: 100)
 * @query   search - Busqueda por email o nombre
 * @query   roleId - Filtrar por ID de rol
 * @query   isActive - Filtrar por estado (true/false)
 * @query   sortBy - Campo de ordenamiento
 * @query   sortOrder - Direccion (asc/desc)
 */
router.get('/', listUsersValidation, userController.getAll);

/**
 * @route   POST /api/users
 * @desc    Crear un nuevo usuario
 * @access  SUPER_ADMIN only
 * @body    email, password, fullName (optional), roleId, isActive (optional)
 */
router.post('/', createUserValidation, userController.create);

/**
 * @route   GET /api/users/:id
 * @desc    Obtener un usuario por ID
 * @access  SUPER_ADMIN only
 */
router.get('/:id', userIdValidation, userController.getById);

/**
 * @route   PUT /api/users/:id
 * @desc    Actualizar un usuario
 * @access  SUPER_ADMIN only
 * @body    email (optional), password (optional), fullName (optional), roleId (optional), isActive (optional)
 */
router.put('/:id', updateUserValidation, userController.update);

// =====================================================
// RUTAS DE ACCIONES ESPECIALES
// =====================================================

/**
 * @route   POST /api/users/:id/deactivate
 * @desc    Desactivar un usuario
 * @access  SUPER_ADMIN only
 */
router.post('/:id/deactivate', userIdValidation, userController.deactivate);

/**
 * @route   POST /api/users/:id/activate
 * @desc    Reactivar un usuario desactivado
 * @access  SUPER_ADMIN only
 */
router.post('/:id/activate', userIdValidation, userController.activate);

/**
 * @route   POST /api/users/:id/verify-email
 * @desc    Verificar email de un usuario manualmente (admin)
 * @access  SUPER_ADMIN only
 */
router.post('/:id/verify-email', userIdValidation, emailVerificationController.adminVerifyEmail);

/**
 * @route   POST /api/users/:id/revoke-sessions
 * @desc    Revocar todas las sesiones activas de un usuario
 * @access  SUPER_ADMIN only
 */
router.post('/:id/revoke-sessions', userIdValidation, userController.revokeSessions);

/**
 * @route   GET /api/users/:id/sessions
 * @desc    Obtener sesiones activas de un usuario
 * @access  SUPER_ADMIN only
 */
router.get('/:id/sessions', userIdValidation, userController.getSessions);

module.exports = router;
