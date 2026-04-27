'use strict';

const cron       = require('node-cron');
const nodemailer = require('nodemailer');
const { query }  = require('./src/config/db');

// ─── MAILER ──────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST,
  port:   parseInt(process.env.MAIL_PORT) || 587,
  secure: process.env.MAIL_SECURE === 'true',
  family: 4,
  auth:   { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

// ─── SQL MIGRATION ───────────────────────────────────────────
/*
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS recordatorio_24h_enviado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recordatorio_2h_enviado  BOOLEAN DEFAULT FALSE;
*/

// ─── QUERIES ─────────────────────────────────────────────────
async function getTurnosPendientes24h() {
  const { rows } = await query(`
    SELECT t.*, u.email AS user_email, u.nombre AS user_nombre
    FROM turnos t
    JOIN usuarios u ON u.id = t.user_id
    WHERE t.estado != 'cancelado'
      AND t.recordatorio_24h_enviado = FALSE
      AND (t.fecha + t.hora) BETWEEN (NOW() + INTERVAL '23 hours 50 minutes')
                                 AND (NOW() + INTERVAL '24 hours 10 minutes')
  `);
  return rows;
}

async function getTurnosPendientes2h() {
  const { rows } = await query(`
    SELECT t.*, u.email AS user_email, u.nombre AS user_nombre
    FROM turnos t
    JOIN usuarios u ON u.id = t.user_id
    WHERE t.estado != 'cancelado'
      AND t.recordatorio_2h_enviado = FALSE
      AND (t.fecha + t.hora) BETWEEN (NOW() + INTERVAL '1 hour 50 minutes')
                                 AND (NOW() + INTERVAL '2 hours 10 minutes')
  `);
  return rows;
}

async function marcarEnviado24h(id) {
  await query(
    `UPDATE turnos SET recordatorio_24h_enviado = TRUE WHERE id = $1`,
    [id]
  );
}

async function marcarEnviado2h(id) {
  await query(
    `UPDATE turnos SET recordatorio_2h_enviado = TRUE WHERE id = $1`,
    [id]
  );
}

// ─── HELPERS ─────────────────────────────────────────────────
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [anio, mes, dia] = fechaStr.toString().split('T')[0].split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(dia)} de ${meses[parseInt(mes) - 1]} de ${anio}`;
}

function formatearHora(horaStr) {
  if (!horaStr) return '';
  return horaStr.toString().slice(0, 5);
}

function linkWhatsApp(telefono, mensaje) {
  const tel = telefono.replace(/\D/g, '');
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

// ─── EMAIL ───────────────────────────────────────────────────
async function enviarEmailRecordatorio(turno, tipo) {
  const etiqueta = tipo === '24h' ? '24 horas' : '2 horas';
  const fecha    = formatearFecha(turno.fecha);
  const hora     = formatearHora(turno.hora);

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
            <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px;">Recordatorio de turno</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:28px;">
            <h2 style="margin:0 0 14px;color:#4A3840;font-size:18px;">
              ⏰ Tu turno es en ${etiqueta}
            </h2>
            <p style="margin:0 0 16px;color:#6B5A60;font-size:15px;line-height:1.6;">
              Hola <strong>${turno.nombre}</strong>, te recordamos tu próximo turno:
            </p>
            <table cellpadding="0" cellspacing="0" width="100%"
                   style="background:#FAF6F7;border-radius:10px;padding:16px;margin:0 0 20px;">
              <tr>
                <td style="padding:6px 0;color:#4A3840;font-size:15px;">
                  📅 <strong>${fecha}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#4A3840;font-size:15px;">
                  🕐 <strong>${hora} hs</strong>
                </td>
              </tr>
              ${turno.servicio_nombre ? `
              <tr>
                <td style="padding:6px 0;color:#4A3840;font-size:15px;">
                  ✂️ <strong>${turno.servicio_nombre}${turno.servicio_zona ? ' · ' + turno.servicio_zona : ''}</strong>
                </td>
              </tr>` : ''}
              <tr>
                <td style="padding:6px 0;color:#4A3840;font-size:15px;">
                  ⏱ <strong>${turno.duracion} minutos</strong>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#9A8F92;font-size:13px;">
              Si necesitás cancelar o reprogramar, contactanos a la brevedad.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F5EEF0;border-radius:0 0 14px 14px;padding:14px 28px;text-align:center;">
            <p style="margin:0;color:#9A8F92;font-size:12px;">© 2025 DEPIMÓVIL PRO</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from:    `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
    to:      turno.telefono.includes('@') ? turno.telefono : turno.user_email,
    subject: `🌸 Recordatorio: tu turno es en ${etiqueta}`,
    text:    `Hola ${turno.nombre}, tu turno es el ${fecha} a las ${hora} hs.`,
    html,
  });
}

// ─── WHATSAPP ────────────────────────────────────────────────
function mensajeWhatsApp(turno, tipo) {
  const etiqueta = tipo === '24h' ? '24 horas' : '2 horas';
  const fecha    = formatearFecha(turno.fecha);
  const hora     = formatearHora(turno.hora);

  let msg = `🌸 *DEPIMÓVIL PRO*\n\n`;
  msg += `Hola ${turno.nombre}! 👋\n`;
  msg += `Te recordamos que tu turno es en *${etiqueta}*:\n\n`;
  msg += `📅 *${fecha}*\n`;
  msg += `🕐 *${hora} hs*\n`;
  if (turno.servicio_nombre) {
    msg += `✂️ *${turno.servicio_nombre}`;
    if (turno.servicio_zona) msg += ` · ${turno.servicio_zona}`;
    msg += `*\n`;
  }
  msg += `⏱ *${turno.duracion} minutos*\n\n`;
  msg += `Si necesitás cancelar, avisanos con tiempo. ¡Gracias! 🌸`;
  return msg;
}

// Nota: wa.me abre el chat con el mensaje prellenado.
// Para envío 100% automático sin intervención se necesita
// WPPConnect/Baileys (ver recordatorios.wppclient.js)
function logWhatsAppLink(turno, tipo) {
  const mensaje = mensajeWhatsApp(turno, tipo);
  const link    = linkWhatsApp(turno.telefono, mensaje);
  console.log(`[WA] Link para ${turno.nombre}: ${link}`);
}

// ─── PROCESADOR ──────────────────────────────────────────────
async function procesarRecordatorios() {
  const ahora = new Date().toISOString();
  console.log(`[CRON] Verificando recordatorios... ${ahora}`);

  // ── 24 horas ──
  try {
    const turnos24h = await getTurnosPendientes24h();
    for (const turno of turnos24h) {
      try {
        await enviarEmailRecordatorio(turno, '24h');
        logWhatsAppLink(turno, '24h');
        await marcarEnviado24h(turno.id);
        console.log(`[CRON] ✅ Recordatorio 24h enviado: ${turno.nombre} (${turno.id})`);
      } catch (err) {
        console.error(`[CRON] ❌ Error 24h para ${turno.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Error al obtener turnos 24h:', err.message);
  }

  // ── 2 horas ──
  try {
    const turnos2h = await getTurnosPendientes2h();
    for (const turno of turnos2h) {
      try {
        await enviarEmailRecordatorio(turno, '2h');
        logWhatsAppLink(turno, '2h');
        await marcarEnviado2h(turno.id);
        console.log(`[CRON] ✅ Recordatorio 2h enviado: ${turno.nombre} (${turno.id})`);
      } catch (err) {
        console.error(`[CRON] ❌ Error 2h para ${turno.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Error al obtener turnos 2h:', err.message);
  }
}

// ─── CRON ─────────────────────────────────────────────────────
// Cada 5 minutos
cron.schedule('*/5 * * * *', procesarRecordatorios);

console.log('[CRON] Recordatorios iniciados — cada 5 minutos');

module.exports = { procesarRecordatorios };
