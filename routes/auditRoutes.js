// =====================================================
// SISTEMA IRIS - Audit Routes
// Rutas para gestion de logs de auditoria
// Todas las rutas requieren rol SUPER_ADMIN
// =====================================================

const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { requireSuperAdmin } = require('../middleware/authMiddleware');

// Nota: La autenticacion se maneja globalmente en index.js via globalAuthGuard
// Solo se requiere verificacion adicional de rol SUPER_ADMIN
router.use(requireSuperAdmin);

// =====================================================
// RUTAS DE AUDITORIA
// =====================================================

/**
 * @route   GET /api/audit/export
 * @desc    Exportar logs de auditoria (CSV o PDF)
 * @access  SUPER_ADMIN only
 * @query   format - csv (default) o pdf
 * @query   actionCode - Filtrar por codigo de accion
 * @query   entityType - Filtrar por tipo de entidad
 * @query   actorUserId - Filtrar por usuario
 * @query   startDate - Fecha inicio (YYYY-MM-DD)
 * @query   endDate - Fecha fin (YYYY-MM-DD)
 */
router.get('/export', auditController.export);

/**
 * @route   GET /api/audit/stats
 * @desc    Obtener estadisticas de auditoria
 * @access  SUPER_ADMIN only
 * @query   startDate - Fecha inicio (YYYY-MM-DD)
 * @query   endDate - Fecha fin (YYYY-MM-DD)
 */
router.get('/stats', auditController.getStats);

/**
 * @route   GET /api/audit/filters
 * @desc    Obtener valores disponibles para filtros
 * @access  SUPER_ADMIN only
 */
router.get('/filters', auditController.getFilters);

/**
 * @route   GET /api/audit
 * @desc    Obtener todos los logs de auditoria con paginacion y filtros
 * @access  SUPER_ADMIN only
 * @query   page - Numero de pagina (default: 1)
 * @query   limit - Registros por pagina (default: 50, max: 100)
 * @query   actionCode - Filtrar por codigo de accion
 * @query   entityType - Filtrar por tipo de entidad
 * @query   entityId - Filtrar por ID de entidad
 * @query   actorUserId - Filtrar por ID de usuario actor
 * @query   startDate - Fecha inicio (YYYY-MM-DD)
 * @query   endDate - Fecha fin (YYYY-MM-DD)
 * @query   search - Busqueda en actionCode y entityType
 */
router.get('/', auditController.getAll);

/**
 * @route   GET /api/audit/:id
 * @desc    Obtener detalle de un log de auditoria
 * @access  SUPER_ADMIN only
 */
router.get('/:id', auditController.getById);

module.exports = router;
