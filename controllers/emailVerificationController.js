// =====================================================
// SISTEMA IRIS - Controlador de Verificacion de Email
// =====================================================

const prisma = require('../config/prisma');
const emailVerificationModel = require('../models/emailVerificationModel');
const { PIN_EXPIRATION_MINUTES } = require('../models/emailVerificationModel');
const emailService = require('../services/emailService');
const emailTemplates = require('../services/emailTemplates');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS, ENTITY_TYPES, ERROR_MESSAGES } = require('../utils/constants');

/**
 * Verificar PIN
 * POST /api/auth/verify-pin
 */
async function verifyPin(req, res) {
  try {
    const { email, pin } = req.body;

    if (!email || !pin) {
      return res.status(400).json({
        success: false,
        error: 'Email y codigo son requeridos.',
        code: 'MISSING_FIELDS',
      });
    }

    // Buscar usuario por email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // No revelar si el email existe
      return res.status(400).json({
        success: false,
        error: 'Codigo invalido o expirado.',
        code: 'INVALID_PIN',
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Este correo ya esta verificado.',
        code: 'ALREADY_VERIFIED',
      });
    }

    // Validar PIN
    const result = await emailVerificationModel.validatePin(user.id, pin);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'INVALID_PIN',
      });
    }

    // Marcar email como verificado
    await emailVerificationModel.markEmailVerified(user.id);

    // Auditoria
    await auditService.logAction(
      user.id,
      AUDIT_ACTIONS.EMAIL_VERIFIED,
      ENTITY_TYPES.USER,
      user.id,
      { email: user.email },
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Correo verificado exitosamente. Ya puedes iniciar sesion.',
    });
  } catch (error) {
    console.error('[EmailVerificationController] Error en verifyPin:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

/**
 * Reenviar PIN
 * POST /api/auth/resend-pin
 */
async function resendPin(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email es requerido.',
        code: 'MISSING_FIELDS',
      });
    }

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // No revelar si el email existe - responder generico
    if (!user || user.emailVerified) {
      return res.status(200).json({
        success: true,
        message: 'Si el correo existe y no esta verificado, se envio un nuevo codigo.',
      });
    }

    // Verificar rate limit
    const { canResend, secondsRemaining } = await emailVerificationModel.canResendPin(user.id);

    if (!canResend) {
      return res.status(429).json({
        success: false,
        error: `Espera ${secondsRemaining} segundos antes de solicitar otro codigo.`,
        code: 'RATE_LIMITED',
        secondsRemaining,
      });
    }

    // Generar nuevo PIN
    const pin = await emailVerificationModel.createPin(user.id);

    // Enviar email
    const { subject, html } = emailTemplates.verificationPinEmail(pin, user.fullName, PIN_EXPIRATION_MINUTES);
    const sent = await emailService.sendEmail({ to: user.email, subject, html });

    // Siempre imprimir en consola para desarrollo
    console.log(`[EmailVerification] PIN para ${user.email}: ${pin}`);

    if (!sent) {
      console.warn(`[EmailVerification] Email no enviado a ${user.email}, PIN: ${pin}`);
    }

    // Auditoria
    await auditService.logAction(
      user.id,
      AUDIT_ACTIONS.EMAIL_VERIFICATION_SENT,
      ENTITY_TYPES.USER,
      user.id,
      { email: user.email },
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Si el correo existe y no esta verificado, se envio un nuevo codigo.',
    });
  } catch (error) {
    console.error('[EmailVerificationController] Error en resendPin:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

/**
 * Admin verifica email de un usuario manualmente
 * POST /api/users/:id/verify-email
 */
async function adminVerifyEmail(req, res) {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Este usuario ya tiene el email verificado.',
        code: 'ALREADY_VERIFIED',
      });
    }

    await emailVerificationModel.markEmailVerified(userId);

    // Auditoria
    await auditService.logAction(
      req.user.id,
      AUDIT_ACTIONS.EMAIL_VERIFIED_BY_ADMIN,
      ENTITY_TYPES.USER,
      userId,
      { email: user.email, verifiedBy: req.user.id },
      req
    );

    return res.status(200).json({
      success: true,
      message: 'Email verificado exitosamente por administrador.',
    });
  } catch (error) {
    console.error('[EmailVerificationController] Error en adminVerifyEmail:', error.message);
    return res.status(500).json({
      success: false,
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
}

module.exports = {
  verifyPin,
  resendPin,
  adminVerifyEmail,
};
