// =====================================================
// SISTEMA IRIS - Modelo de Verificacion de Email
// =====================================================

const crypto = require('crypto');
const prisma = require('../config/prisma');

const PIN_EXPIRATION_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const emailVerificationModel = {
  /**
   * Genera un PIN de 6 digitos, invalida anteriores y crea registro
   * @param {number} userId
   * @returns {Promise<string>} PIN generado
   */
  async createPin(userId) {
    // Invalidar PINs anteriores del usuario (marcar como usados)
    await prisma.emailVerification.updateMany({
      where: {
        userId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Generar PIN de 6 digitos
    const pin = String(crypto.randomInt(100000, 999999));

    // Crear registro con expiracion de 15 minutos
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + PIN_EXPIRATION_MINUTES);

    await prisma.emailVerification.create({
      data: {
        userId,
        pin,
        expiresAt,
      },
    });

    return pin;
  },

  /**
   * Valida un PIN para un usuario
   * @param {number} userId
   * @param {string} pin
   * @returns {Promise<{valid: boolean, error: string|null}>}
   */
  async validatePin(userId, pin) {
    // Buscar PIN activo (no usado, no expirado)
    const verification = await prisma.emailVerification.findFirst({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { dateTimeRegistration: 'desc' },
    });

    if (!verification) {
      return { valid: false, error: 'Codigo expirado o invalido. Solicita uno nuevo.' };
    }

    // Verificar intentos
    if (verification.attempts >= MAX_ATTEMPTS) {
      // Invalidar PIN por exceso de intentos
      await prisma.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      });
      return { valid: false, error: 'Demasiados intentos. Solicita un nuevo codigo.' };
    }

    // Verificar PIN
    if (verification.pin !== pin) {
      // Incrementar intentos
      await prisma.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: verification.attempts + 1 },
      });
      const remaining = MAX_ATTEMPTS - verification.attempts - 1;
      return { valid: false, error: `Codigo incorrecto. ${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}.` };
    }

    // PIN correcto - marcar como usado
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });

    return { valid: true, error: null };
  },

  /**
   * Marca emailVerified = true para un usuario
   * @param {number} userId
   */
  async markEmailVerified(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  },

  /**
   * Verifica si se puede reenviar un PIN (cooldown de 60s)
   * @param {number} userId
   * @returns {Promise<{canResend: boolean, secondsRemaining: number}>}
   */
  async canResendPin(userId) {
    const lastPin = await prisma.emailVerification.findFirst({
      where: { userId },
      orderBy: { dateTimeRegistration: 'desc' },
    });

    if (!lastPin) {
      return { canResend: true, secondsRemaining: 0 };
    }

    const elapsed = (Date.now() - lastPin.dateTimeRegistration.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return {
        canResend: false,
        secondsRemaining: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
      };
    }

    return { canResend: true, secondsRemaining: 0 };
  },
};

module.exports = emailVerificationModel;
