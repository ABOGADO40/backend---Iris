// =====================================================
// SISTEMA IRIS - Servicio de Email
// Envio de correos via Resend API (HTTPS)
// =====================================================

const { Resend } = require('resend');

let resendClient = null;

function getClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[EmailService] RESEND_API_KEY no configurada. Los emails se mostraran solo en consola.');
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Envia un email via Resend API
 * @param {Object} options
 * @param {string} options.to - Destinatario
 * @param {string} options.subject - Asunto
 * @param {string} options.html - Contenido HTML
 * @returns {Promise<boolean>} true si se envio, false si fallo
 */
async function sendEmail({ to, subject, html }) {
  const from = process.env.RESEND_FROM;

  try {
    const client = getClient();

    if (!client) {
      console.log(`[EmailService] Resend no disponible. Email para ${to}:`);
      console.log(`  Asunto: ${subject}`);
      return false;
    }

    if (!from) {
      console.error('[EmailService] RESEND_FROM no configurada.');
      return false;
    }

    const { error } = await client.emails.send({
      from,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error(`[EmailService] Error enviando email a ${to}:`, error.message);
      return false;
    }

    console.log(`[EmailService] Email enviado a ${to}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Error enviando email a ${to}:`, error.message);
    return false;
  }
}

module.exports = { sendEmail };
