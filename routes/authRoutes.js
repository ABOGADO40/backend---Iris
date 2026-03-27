// =====================================================
// SISTEMA IRIS - Rutas de Autenticacion
// Fecha: 2026-01-19
// =====================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const emailVerificationController = require('../controllers/emailVerificationController');

// Nota: La autenticacion se maneja globalmente en index.js via globalAuthGuard
// Las rutas /login y /register estan en la whitelist (publicas)
// Las rutas /me y /logout requieren token (verificado por globalAuthGuard)

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesion con email y password
 * @access  Public (whitelist)
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/auth/register
 * @desc    Registrar nuevo usuario
 * @access  Public (whitelist)
 */
router.post('/register', authController.register);

/**
 * @route   POST /api/auth/verify-pin
 * @desc    Verificar PIN de email
 * @access  Public (whitelist)
 */
router.post('/verify-pin', emailVerificationController.verifyPin);

/**
 * @route   POST /api/auth/resend-pin
 * @desc    Reenviar PIN de verificacion
 * @access  Public (whitelist)
 */
router.post('/resend-pin', emailVerificationController.resendPin);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener informacion del usuario autenticado
 * @access  Private (verificado por globalAuthGuard)
 */
router.get('/me', authController.me);

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesion actual
 * @access  Private (verificado por globalAuthGuard)
 */
router.post('/logout', authController.logout);

module.exports = router;
