'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST,
  port:   parseInt(process.env.MAIL_PORT) || 587,
  secure: process.env.MAIL_SECURE === 'true',
  family: 4,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

function htmlBienvenida({ nombre, nombreNegocio, email, plan, trialFin }) {
  const esTrial   = plan === 'trial';
  const planLabel = esTrial ? '🕐 Plan Trial' : '⭐ Plan Premium';
  const planColor = esTrial ? '#C4889A' : '#A85568';

  const trialTexto = esTrial && trialFin
    ? `<p style="margin:0 0 8px;">Tu período de prueba está activo hasta el <strong>${new Date(trialFin).toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })}</strong>.</p>`
    : '';

  const negocioTexto = nombreNegocio
    ? `<p style="margin:0 0 8px;">Tu agenda está lista como <strong>${nombreNegocio}</strong>.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenida a DEPIMÓVIL PRO</title>
</head>
<body style="margin:0;padding:0;background:#FAF6F7;font-family:'Helvetica Neue',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6F7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- HEADER -->
          <tr>
            <td align="center" style="background:#A85568;border-radius:14px 14px 0 0;padding:32px 24px 24px;">
              <p style="margin:0 0 6px;font-size:32px;">🌸</p>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:.5px;">DEPIMÓVIL PRO</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px;letter-spacing:.3px;">Tu agenda profesional</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#fff;padding:32px 28px;">

              <h2 style="margin:0 0 16px;color:#4A3840;font-size:20px;font-weight:700;">
                ¡Bienvenida, ${nombre}! 🎉
              </h2>

              <p style="margin:0 0 12px;color:#6B5A60;font-size:15px;line-height:1.6;">
                Tu cuenta fue activada exitosamente. Ya podés acceder a tu agenda y empezar a organizar tus turnos.
              </p>

              ${negocioTexto}

              <!-- PLAN BADGE -->
              <table cellpadding="0" cellspacing="0" style="margin:20px 0;">
                <tr>
                  <td style="background:${planColor};border-radius:100px;padding:8px 20px;">
                    <span style="color:#fff;font-size:14px;font-weight:700;">${planLabel}</span>
                  </td>
                </tr>
              </table>

              ${trialTexto}

              <p style="margin:0 0 24px;color:#6B5A60;font-size:15px;line-height:1.6;">
                Desde tu agenda podés:
              </p>

              <!-- FEATURES -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
                ${[
                  ['📋', 'Gestionar tus turnos del día'],
                  ['📅', 'Ver tu calendario mensual'],
                  ['✂️', 'Crear tus servicios con colores y duración'],
                  ['💬', 'Enviar confirmaciones por WhatsApp'],
                  ['🎂', 'Recordar cumpleaños de tus clientas'],
                ].map(([icon, texto]) => `
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid #F5EEF0;">
                    <span style="font-size:16px;margin-right:10px;">${icon}</span>
                    <span style="color:#4A3840;font-size:14px;">${texto}</span>
                  </td>
                </tr>`).join('')}
              </table>

              <p style="margin:0 0 8px;color:#9A8F92;font-size:13px;">
                Tu email de acceso: <strong style="color:#4A3840;">${email}</strong>
              </p>

              <p style="margin:0;color:#9A8F92;font-size:13px;line-height:1.5;">
                Si tenés alguna consulta, respondé este correo y te ayudamos.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#F5EEF0;border-radius:0 0 14px 14px;padding:16px 28px;text-align:center;">
              <p style="margin:0;color:#9A8F92;font-size:12px;">
                © 2025 DEPIMÓVIL PRO · Este mensaje fue enviado a ${email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

async function enviarBienvenida({ nombre, nombreNegocio, email, plan, trialFin }) {
  const esTrial   = plan === 'trial';
  const planLabel = esTrial ? 'Plan Trial' : 'Plan Premium';

  try {
    await transporter.sendMail({
      from:    `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
      to:      email,
      subject: `🌸 ¡Bienvenida a DEPIMÓVIL PRO, ${nombre}!`,
      text:    `Hola ${nombre}, tu cuenta fue activada con ${planLabel}. Gracias por usar DEPIMÓVIL PRO.`,
      html:    htmlBienvenida({ nombre, nombreNegocio, email, plan, trialFin }),
    });
    console.log(`[MAILER] Bienvenida enviada a ${email}`);
  } catch (err) {
    // No bloquear el registro si el mail falla
    console.error('[MAILER] Error al enviar bienvenida:', err.message);
  }
}

async function enviarCambioPlan({ nombre, email, plan, trialFin }) {
  const esTrial   = plan === 'trial';
  const planLabel = esTrial ? '🕐 Plan Trial' : '⭐ Plan Premium';
  const planColor = esTrial ? '#C4889A' : '#A85568';
  const trialTexto = esTrial && trialFin
    ? '<p style="margin:0 0 8px;color:#6B5A60;font-size:15px;">Tu período de prueba está activo hasta el <strong>' + new Date(trialFin).toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' }) + '</strong>.</p>'
    : '';
  const html = '<html><body style="font-family:Arial,sans-serif;background:#FAF6F7;padding:32px 16px;"><div style="max-width:520px;margin:0 auto;"><div style="background:#A85568;border-radius:14px 14px 0 0;padding:28px 24px;text-align:center;"><p style="margin:0;font-size:28px;">🌸</p><h1 style="margin:6px 0 0;color:#fff;font-size:20px;">DEPIMÓVIL PRO</h1></div><div style="background:#fff;padding:28px;"><h2 style="color:#4A3840;font-size:18px;margin:0 0 14px;">¡Tu plan fue actualizado, ' + nombre + '!</h2><p style="color:#6B5A60;font-size:15px;line-height:1.6;margin:0 0 16px;">Tu cuenta fue actualizada exitosamente al siguiente plan:</p><div style="display:inline-block;background:' + planColor + ';border-radius:100px;padding:8px 20px;margin:0 0 16px;"><span style="color:#fff;font-size:14px;font-weight:700;">' + planLabel + '</span></div>' + trialTexto + '<p style="color:#9A8F92;font-size:13px;margin:16px 0 0;">Si tenés alguna consulta, respondé este correo.</p></div><div style="background:#F5EEF0;border-radius:0 0 14px 14px;padding:14px 28px;text-align:center;"><p style="margin:0;color:#9A8F92;font-size:12px;">© 2025 DEPIMÓVIL PRO · ' + email + '</p></div></div></body></html>';
  try {
    await transporter.sendMail({
      from:    '"DEPIMÓVIL PRO" <' + process.env.MAIL_USER + '>',
      to:      email,
      subject: '🌸 Tu plan fue actualizado — ' + planLabel,
      text:    'Hola ' + nombre + ', tu plan fue actualizado a ' + planLabel + '.',
      html,
    });
    console.log('[MAILER] Cambio de plan enviado a ' + email);
  } catch (err) {
    console.error('[MAILER] Error al enviar cambio de plan:', err.message);
  }
}


async function enviarCuentaBaja({ nombre, email }) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FAF6F7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6F7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td align="center" style="background:#A85568;border-radius:14px 14px 0 0;padding:28px 24px 20px;">
            <p style="margin:0 0 6px;font-size:28px;">🌸</p>
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">DEPIMÓVIL PRO</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:28px;">
            <h2 style="margin:0 0 14px;color:#4A3840;font-size:18px;">Tu cuenta fue desactivada</h2>
            <p style="margin:0 0 12px;color:#6B5A60;font-size:15px;line-height:1.6;">
              Hola <strong>${nombre}</strong>, tu cuenta de DEPIMÓVIL PRO fue desactivada temporalmente.
            </p>
            <p style="margin:0 0 12px;color:#6B5A60;font-size:15px;line-height:1.6;">
              Si creés que esto es un error o querés reactivarla, respondé este correo y te ayudamos.
            </p>
            <p style="margin:16px 0 0;color:#9A8F92;font-size:13px;">
              Podés contactarnos respondiendo este email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F5EEF0;border-radius:0 0 14px 14px;padding:14px 28px;text-align:center;">
            <p style="margin:0;color:#9A8F92;font-size:12px;">© 2025 DEPIMÓVIL PRO · ${email}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from:    `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
      to:      email,
      subject: '🌸 Tu cuenta de DEPIMÓVIL PRO fue desactivada',
      text:    `Hola ${nombre}, tu cuenta fue desactivada. Si creés que es un error, respondé este correo.`,
      html,
    });
    console.log(`[MAILER] Cuenta baja enviado a ${email}`);
  } catch (err) {
    console.error('[MAILER] Error al enviar cuenta baja:', err.message);
  }
}

async function enviarCuentaEliminada({ nombre, email }) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FAF6F7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6F7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td align="center" style="background:#A85568;border-radius:14px 14px 0 0;padding:28px 24px 20px;">
            <p style="margin:0 0 6px;font-size:28px;">🌸</p>
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">DEPIMÓVIL PRO</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:28px;">
            <h2 style="margin:0 0 14px;color:#4A3840;font-size:18px;">Tu cuenta fue eliminada</h2>
            <p style="margin:0 0 12px;color:#6B5A60;font-size:15px;line-height:1.6;">
              Hola <strong>${nombre}</strong>, tu cuenta de DEPIMÓVIL PRO fue eliminada permanentemente junto con todos tus datos.
            </p>
            <p style="margin:0 0 12px;color:#6B5A60;font-size:15px;line-height:1.6;">
              Si no solicitaste esta acción o tenés alguna consulta, respondé este correo.
            </p>
            <p style="margin:16px 0 0;color:#9A8F92;font-size:13px;">
              Gracias por haber usado DEPIMÓVIL PRO. 🌸
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F5EEF0;border-radius:0 0 14px 14px;padding:14px 28px;text-align:center;">
            <p style="margin:0;color:#9A8F92;font-size:12px;">© 2025 DEPIMÓVIL PRO · ${email}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from:    `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
      to:      email,
      subject: '🌸 Tu cuenta de DEPIMÓVIL PRO fue eliminada',
      text:    `Hola ${nombre}, tu cuenta fue eliminada permanentemente. Si no solicitaste esto, respondé este correo.`,
      html,
    });
    console.log(`[MAILER] Cuenta eliminada enviado a ${email}`);
  } catch (err) {
    console.error('[MAILER] Error al enviar cuenta eliminada:', err.message);
  }
}

module.exports = { enviarBienvenida, enviarCambioPlan, enviarCuentaBaja, enviarCuentaEliminada };