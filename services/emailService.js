// =====================================================
// SISTEMA IRIS - Servicio de Email
// Envio de correos via SMTP (Gmail)
// =====================================================

const nodemailer = require('nodemailer');

// Crear transporter con configuracion de variables de entorno
let transporter = null;

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      console.warn('[EmailService] SMTP no configurado. Los emails se mostraran solo en consola.');
      return null;
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
  return transporter;
}

/**
 * Envia un email
 * @param {Object} options
 * @param {string} options.to - Destinatario
 * @param {string} options.subject - Asunto
 * @param {string} options.html - Contenido HTML
 * @returns {Promise<boolean>} true si se envio, false si fallo
 */
async function sendEmail({ to, subject, html }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  try {
    const transport = getTransporter();

    if (!transport) {
      console.log(`[EmailService] SMTP no disponible. Email para ${to}:`);
      console.log(`  Asunto: ${subject}`);
      return false;
    }

    await transport.sendMail({ from, to, subject, html });
    console.log(`[EmailService] Email enviado a ${to}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Error enviando email a ${to}:`, error.message);
    return false;
  }
}

module.exports = { sendEmail };
