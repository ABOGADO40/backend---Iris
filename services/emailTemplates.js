// =====================================================
// SISTEMA IRIS - Templates de Email
// =====================================================

/**
 * Template para el email de verificacion con PIN
 * @param {string} pin - Codigo de 6 digitos
 * @param {string} fullName - Nombre del usuario
 * @returns {Object} { subject, html }
 */
function verificationPinEmail(pin, fullName) {
  const subject = `${pin} - Codigo de verificacion | Sistema IRIS`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e3a5f;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Sistema IRIS</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 16px;color:#333333;font-size:16px;">
                Hola <strong>${fullName || 'Usuario'}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#555555;font-size:15px;line-height:1.5;">
                Tu codigo de verificacion es:
              </p>
              <!-- PIN -->
              <div style="text-align:center;margin:0 0 28px;">
                <div style="display:inline-block;background-color:#f0f4f8;border:2px solid #1e3a5f;border-radius:10px;padding:16px 32px;letter-spacing:12px;font-size:36px;font-weight:700;color:#1e3a5f;">
                  ${pin}
                </div>
              </div>
              <p style="margin:0 0 8px;color:#555555;font-size:14px;line-height:1.5;">
                Ingresa este codigo en la pagina de verificacion para activar tu cuenta.
              </p>
              <p style="margin:0 0 0;color:#999999;font-size:13px;line-height:1.5;">
                Este codigo expira en <strong>15 minutos</strong>. Si no solicitaste esta verificacion, puedes ignorar este correo.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 32px;text-align:center;border-top:1px solid #e9ecef;">
              <p style="margin:0;color:#999999;font-size:12px;">
                Sistema IRIS - Plataforma de Gestion Legal
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

module.exports = { verificationPinEmail };
