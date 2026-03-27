// =====================================================
// SISTEMA IRIS - Usage Routes
// Rutas para consumo de tokens
// =====================================================

const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usageController');

const requireSuperAdmin = (req, res, next) => {
  if (req.user.roleName !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  }
  next();
};

// Rutas de usuario (cualquier autenticado)
router.get('/me', usageController.getMyUsage);
router.get('/me/by-day', usageController.getMyUsageByDay);
router.get('/me/by-case', usageController.getMyUsageByCase);

// Rutas de admin (solo SUPER_ADMIN)
router.get('/admin/users', requireSuperAdmin, usageController.getAdminUsers);
router.get('/admin/user/:userId', requireSuperAdmin, usageController.getAdminUserDetail);

module.exports = router;
