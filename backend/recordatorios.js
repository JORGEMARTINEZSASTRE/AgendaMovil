'use strict';

const cron       = require('node-cron');
const nodemailer = require('nodemailer');
const { query }  = require('./src/config/db');
const evolution = require('./src/services/evolution.service');

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
function formatearFecha(fechaInput) {
  if (!fechaInput) return '';

  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];

  let fecha;

  // Si viene como objeto Date
  if (fechaInput instanceof Date) {
    fecha = fechaInput;
  } else {
    // Si viene como string
    const str = String(fechaInput);
    // Intentar ISO o formato YYYY-MM-DD
    fecha = new Date(str);
    if (isNaN(fecha.getTime())) return str; // fallback: devolver tal cual
  }

  const dia = fecha.getUTCDate();
  const mes = fecha.getUTCMonth();
  const anio = fecha.getUTCFullYear();

  return `${dia} de ${meses[mes]} de ${anio}`;
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

  let msg = `🌸 *AGENDAMOVIL PRO*\n\n`;
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
async function enviarWhatsAppAutomatico(turno, tipo) {
  try {
    if (!turno.telefono) {
      console.log(`[WA] Turno ${turno.id} sin teléfono, skip`);
      return { ok: false, error: 'sin_telefono' };
    }

    // Verificar que la estética tenga WhatsApp conectado
    const instance = `user_${turno.user_id}`;
    const estadoRes = await evolution.estadoInstancia(instance);

    if (!estadoRes.ok || estadoRes.estado !== 'open') {
      console.log(`[WA] Usuario ${turno.user_id} sin WhatsApp conectado (estado: ${estadoRes.estado || 'error'})`);
      // Fallback: loguear el link para envío manual
      const mensaje = mensajeWhatsApp(turno, tipo);
      const link    = linkWhatsApp(turno.telefono, mensaje);
      console.log(`[WA] Link fallback para ${turno.nombre}: ${link}`);
      return { ok: false, error: 'wa_desconectado' };
    }

    // Enviar el mensaje automáticamente
    const mensaje = mensajeWhatsApp(turno, tipo);
    const resultado = await evolution.enviarMensaje(instance, turno.telefono, mensaje);

    if (!resultado.ok) {
      console.error(`[WA] ❌ Error enviando a ${turno.nombre}:`, resultado.error);
      return { ok: false, error: resultado.error };
    }

    console.log(`[WA] ✅ ${tipo} enviado automáticamente a ${turno.nombre} (${turno.telefono})`);
    return { ok: true };

  } catch (err) {
    console.error(`[WA] Error general:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ─── PROCESADOR ──────────────────────────────────────────────
async function procesarRecordatorios() {
  const ahora = new Date().toISOString();
  console.log(`[CRON] Verificando recordatorios... ${ahora}`);

    // ── DEBUG TEMPORAL ──
  try {
    const { rows } = await query(`
      SELECT 
        id, nombre, fecha, hora,
        (fecha + hora) AS datetime_turno,
        NOW() AS ahora_db,
        EXTRACT(EPOCH FROM ((fecha + hora) - NOW())) / 3600 AS horas_hasta_turno,
        recordatorio_24h_enviado,
        recordatorio_2h_enviado,
        estado
      FROM turnos
      WHERE estado != 'cancelado'
      ORDER BY fecha, hora
      LIMIT 10
    `);
    console.log('[DEBUG] Turnos:', JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('[DEBUG] Error:', err.message);
  }
  // ── FIN DEBUG ──

  // ── 24 horas ──
   try {
    const turnos24h = await getTurnosPendientes24h();
    for (const turno of turnos24h) {
      try { await enviarEmailRecordatorio(turno, '24h'); }
      catch (err) { console.error(`[CRON] ❌ Email 24h para ${turno.id}:`, err.message); }

      try { await enviarWhatsAppAutomatico(turno, '24h'); }
      catch (err) { console.error(`[CRON] ❌ WA 24h para ${turno.id}:`, err.message); }

      await marcarEnviado24h(turno.id);
      console.log(`[CRON] ✅ Recordatorio 24h: ${turno.nombre} (${turno.id})`);
    }
    await new Promise(r => setTimeout(r, 1500));
  } catch (err) {
    console.error('[CRON] Error al obtener turnos 24h:', err.message);
  }

  // ── 2 horas ──
  try {
    const turnos2h = await getTurnosPendientes2h();
    for (const turno of turnos2h) {
      try { await enviarEmailRecordatorio(turno, '2h'); }
      catch (err) { console.error(`[CRON] ❌ Email 2h para ${turno.id}:`, err.message); }

      try { await enviarWhatsAppAutomatico(turno, '2h'); }
      catch (err) { console.error(`[CRON] ❌ WA 2h para ${turno.id}:`, err.message); }

      await marcarEnviado2h(turno.id);
      console.log(`[CRON] ✅ Recordatorio 2h: ${turno.nombre} (${turno.id})`);
    }
    await new Promise(r => setTimeout(r, 1500));
  } catch (err) {
    console.error('[CRON] Error al obtener turnos 2h:', err.message);
  }
}

// ─── CRON ─────────────────────────────────────────────────────
// Cada 5 minutos
cron.schedule('*/5 * * * *', procesarRecordatorios);

console.log('[CRON] Recordatorios iniciados — cada 5 minutos');
// ═══════════════════════════════════════════════════════════
//  TEST MANUAL — Dispara recordatorio para un turno específico
// ═══════════════════════════════════════════════════════════
async function testRecordatorioManual(turnoId, tipo = '2h') {
  try {
    const { rows } = await query(`
      SELECT t.*, u.email AS user_email, u.nombre AS user_nombre
      FROM turnos t
      JOIN usuarios u ON u.id = t.user_id
      WHERE t.id = $1
    `, [turnoId]);

    if (rows.length === 0) {
      console.log('[TEST] Turno no encontrado');
      return { ok: false, error: 'Turno no encontrado' };
    }

    const turno = rows[0];
    console.log(`[TEST] Enviando ${tipo} a ${turno.nombre} (${turno.telefono})`);

    const resultado = await enviarWhatsAppAutomatico(turno, tipo);
    return resultado;

  } catch (err) {
    console.error('[TEST] Error:', err.message);
    return { ok: false, error: err.message };
  }
}
// ═══════════════════════════════════════════════════════════
//  CONFIRMACIÓN DE TURNO (se dispara al crear turno)
// ═══════════════════════════════════════════════════════════
function mensajeConfirmacion(turno) {
  const fecha = formatearFecha(turno.fecha);
  const hora  = formatearHora(turno.hora);

  let msg = `🌸 *Confirmación de turno*\n\n`;
  msg += `¡Hola ${turno.nombre}! 👋\n\n`;
  msg += `Tu turno quedó agendado para:\n\n`;
  msg += `📅 *${fecha}*\n`;
  msg += `🕐 *${hora} hs*\n`;
  if (turno.servicio_nombre) {
    msg += `✂️ *${turno.servicio_nombre}`;
    if (turno.servicio_zona) msg += ` · ${turno.servicio_zona}`;
    msg += `*\n`;
  }
  msg += `⏱ *${turno.duracion} minutos*\n\n`;
  msg += `¡Te esperamos! Si necesitás cancelar o reprogramar, avisanos con tiempo. 🌸`;
  return msg;
}

async function enviarConfirmacionTurno(turno) {
  try {
    if (!turno.telefono) {
      console.log(`[WA-CONFIRM] Turno ${turno.id} sin teléfono, skip`);
      return { ok: false, error: 'sin_telefono' };
    }

    const instance = `user_${turno.user_id}`;
    const estadoRes = await evolution.estadoInstancia(instance);

    if (!estadoRes.ok || estadoRes.estado !== 'open') {
      console.log(`[WA-CONFIRM] Usuario ${turno.user_id} sin WhatsApp conectado`);
      return { ok: false, error: 'wa_desconectado' };
    }

    const mensaje = mensajeConfirmacion(turno);
    const resultado = await evolution.enviarMensaje(instance, turno.telefono, mensaje);

    if (!resultado.ok) {
      console.error(`[WA-CONFIRM] ❌ Error:`, resultado.error);
      return { ok: false, error: resultado.error };
    }

    console.log(`[WA-CONFIRM] ✅ Confirmación enviada a ${turno.nombre} (${turno.telefono})`);
    return { ok: true };

  } catch (err) {
    console.error(`[WA-CONFIRM] Error general:`, err.message);
    return { ok: false, error: err.message };
  }
}
// ═══════════════════════════════════════════════════════════
//  CONFIRMACIÓN DE SEÑA
// ═══════════════════════════════════════════════════════════
async function enviarConfirmacionSenia(turno) {
  try {
    if (!turno.telefono) return { ok: false, error: 'sin_telefono' };

    const instance = `user_${turno.user_id}`;
    const estadoRes = await evolution.estadoInstancia(instance);
    if (!estadoRes.ok || estadoRes.estado !== 'open') {
      console.log(`[WA-SENIA] Usuario ${turno.user_id} sin WhatsApp conectado`);
      return { ok: false, error: 'wa_desconectado' };
    }

    const fecha = formatearFecha(turno.fecha);
    const hora  = formatearHora(turno.hora);

    let msg = `🌸 *¡Seña recibida!*\n\n`;
    msg += `¡Hola ${turno.nombre}! 💰\n\n`;
    msg += `Tu seña fue confirmada. Tu turno queda *CONFIRMADO* ✅\n\n`;
    msg += `📅 *${fecha}*\n`;
    msg += `🕐 *${hora} hs*\n`;
    if (turno.servicio_nombre) msg += `✂️ *${turno.servicio_nombre}*\n`;
    msg += `⏱ *${turno.duracion} minutos*\n\n`;
    msg += `¡Te esperamos! 🌸`;

    const resultado = await evolution.enviarMensaje(instance, turno.telefono, msg);
    if (resultado.ok) {
      console.log(`[WA-SENIA] ✅ Confirmación enviada a ${turno.nombre}`);
    } else {
      console.error(`[WA-SENIA] ❌ Error:`, resultado.error);
    }
    return resultado;
  } catch (err) {
    console.error(`[WA-SENIA] Error:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  MODIFICACIÓN DE TURNO
// ═══════════════════════════════════════════════════════════
async function enviarModificacionTurno(turno) {
  try {
    if (!turno.telefono) return { ok: false, error: 'sin_telefono' };

    const instance = `user_${turno.user_id}`;
    const estadoRes = await evolution.estadoInstancia(instance);
    if (!estadoRes.ok || estadoRes.estado !== 'open') {
      console.log(`[WA-MOD] Usuario ${turno.user_id} sin WhatsApp conectado`);
      return { ok: false, error: 'wa_desconectado' };
    }

    const fecha = formatearFecha(turno.fecha);
    const hora  = formatearHora(turno.hora);

    let msg = `🌸 *Turno reprogramado*\n\n`;
    msg += `¡Hola ${turno.nombre}! ✏️\n\n`;
    msg += `Tu turno fue modificado. Los nuevos datos son:\n\n`;
    msg += `📅 *${fecha}*\n`;
    msg += `🕐 *${hora} hs*\n`;
    if (turno.servicio_nombre) msg += `✂️ *${turno.servicio_nombre}*\n`;
    msg += `⏱ *${turno.duracion} minutos*\n\n`;
    msg += `Si tenés alguna duda, respondé este mensaje. 🌸`;

    const resultado = await evolution.enviarMensaje(instance, turno.telefono, msg);
    if (resultado.ok) {
      console.log(`[WA-MOD] ✅ Modificación enviada a ${turno.nombre}`);
    } else {
      console.error(`[WA-MOD] ❌ Error:`, resultado.error);
    }
    return resultado;
  } catch (err) {
    console.error(`[WA-MOD] Error:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
//  CANCELACIÓN DE TURNO
// ═══════════════════════════════════════════════════════════
async function enviarCancelacionTurno(turno) {
  try {
    if (!turno.telefono) return { ok: false, error: 'sin_telefono' };

    const instance = `user_${turno.user_id}`;
    const estadoRes = await evolution.estadoInstancia(instance);
    if (!estadoRes.ok || estadoRes.estado !== 'open') {
      console.log(`[WA-CANCEL] Usuario ${turno.user_id} sin WhatsApp conectado`);
      return { ok: false, error: 'wa_desconectado' };
    }

    const fecha = formatearFecha(turno.fecha);
    const hora  = formatearHora(turno.hora);

    let msg = `🌸 *Turno cancelado*\n\n`;
    msg += `Hola ${turno.nombre}, 😔\n\n`;
    msg += `Te informamos que tu turno fue cancelado:\n\n`;
    msg += `📅 ~${fecha}~\n`;
    msg += `🕐 ~${hora} hs~\n`;
    if (turno.servicio_nombre) msg += `✂️ ~${turno.servicio_nombre}~\n`;
    msg += `\nSi querés reprogramar, contactanos. ¡Gracias! 🌸`;

    const resultado = await evolution.enviarMensaje(instance, turno.telefono, msg);
    if (resultado.ok) {
      console.log(`[WA-CANCEL] ✅ Cancelación enviada a ${turno.nombre}`);
    } else {
      console.error(`[WA-CANCEL] ❌ Error:`, resultado.error);
    }
    return resultado;
  } catch (err) {
    console.error(`[WA-CANCEL] Error:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { 
  procesarRecordatorios, 
  testRecordatorioManual,
  enviarConfirmacionTurno,
  enviarConfirmacionSenia,
  enviarModificacionTurno,
  enviarCancelacionTurno,
};
procesarRecordatorios().then(() => console.log('[TEST] Ciclo manual OK'));
