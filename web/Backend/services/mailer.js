// services/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,                    // ej: smtp.gmail.com, smtp.zoho.com, mail.tudominio.com
  port: Number(process.env.SMTP_PORT || 465),     // 465 (secure) o 587 (starttls)
  secure: process.env.SMTP_SECURE !== 'false',    // true si usas 465
  auth: {
    user: process.env.SMTP_USER,                  // usuario SMTP
    pass: process.env.SMTP_PASS                   // contraseña SMTP o App Password
  }
});

function renderAppointmentTemplate({ nombre, servicio, fecha, cfg }) {
  const fechaFmt = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'full', timeStyle: 'short'
  }).format(new Date(fecha));

  const prepList = (cfg?.mensajes?.preparacion || '')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => `<li>${l}</li>`).join('');

  const pagosList = (cfg?.mensajes?.pagos || '')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => `<li>${l}</li>`).join('');

  const brand = cfg?.nombre || 'Heaven Lashes';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Confirmación de cita – ${brand}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.04)">
          <tr>
            <td style="background:#111827;color:#fff;padding:20px 24px;font-size:20px;font-weight:700;">
              ${brand} – Confirmación de cita
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#111827;">
              <p style="margin:0 0 12px">Hola <strong>${nombre || 'cliente'}</strong>,</p>
              <p style="margin:0 0 16px">¡Tu cita ha sido registrada! Estos son los detalles:</p>
              <ul style="margin:0 0 16px 20px;padding:0;line-height:1.6">
                <li><strong>Servicio:</strong> ${servicio || '—'}</li>
                <li><strong>Fecha y hora:</strong> ${fechaFmt}</li>
              </ul>

              ${prepList ? `
              <h3 style="margin:20px 0 8px;font-size:16px;">Antes de tu cita</h3>
              <ul style="margin:0 0 16px 20px;line-height:1.6">${prepList}</ul>` : ''}

              ${pagosList ? `
              <h3 style="margin:20px 0 8px;font-size:16px;">Formas de pago</h3>
              <ul style="margin:0 0 16px 20px;line-height:1.6">${pagosList}</ul>` : ''}

              <p style="margin:20px 0 0;color:#6b7280;font-size:13px">
                Si necesitas reprogramar o cancelar, responde a este correo o escríbenos por WhatsApp.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f3f4f6;color:#6b7280;padding:16px 24px;font-size:12px">
              © ${new Date().getFullYear()} ${brand}. Todos los derechos reservados.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendAppointmentEmail({ to, nombre, servicio, fecha, cfg }) {
  if (!to) return;
  const html = renderAppointmentTemplate({ nombre, servicio, fecha, cfg });
  const subject = `Confirmación de cita – ${cfg?.nombre || 'Heaven Lashes'}`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || `"${cfg?.nombre || 'Heaven Lashes'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  });
}

module.exports = { sendAppointmentEmail };
