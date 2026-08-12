'use strict';

const cron       = require('node-cron');
const nodemailer = require('nodemailer');
const { query }  = require('./src/config/db');
const evolution = require('./src/services/evolution.service');

// Dominio propio para los links que le llegan a la clienta. Va por env
// para no romper si algún día cambia el dominio, pero con el valor real
// por defecto: en Railway las variables se cargan a mano y si esto queda
// vacío el link del recordatorio sale roto.
const APP_URL = (process.env.APP_URL || 'https://agendamovil.pro').replace(/\/+$/, '');

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
  // Se le crea el token de confirmación en el mismo paso: así el link
  // existe recién cuando se va a mandar el recordatorio y no queda un
  // link vivo por cada turno futuro de la agenda.
  await query(`
    UPDATE turnos
       SET confirmacion_token  = COALESCE(confirmacion_token, gen_random_uuid()),
           confirmacion_estado = CASE WHEN confirmacion_estado = 'sin_pedir'
                                      THEN 'pendiente' ELSE confirmacion_estado END
     WHERE estado != 'cancelado'
       AND recordatorio_24h_enviado = FALSE
       AND (fecha + hora) BETWEEN (NOW() + INTERVAL '23 hours 50 minutes')
                              AND (NOW() + INTERVAL '24 hours 10 minutes')
  `);

  const { rows } = await query(`
    SELECT t.*, u.email AS user_email, u.nombre AS user_nombre, u.nombre_negocio,
           s.nombre AS sucursal_nombre
    FROM turnos t
    JOIN usuarios u ON u.id = t.user_id
    LEFT JOIN sucursales s ON s.id = t.sucursal_id
    WHERE t.estado != 'cancelado'
      AND t.recordatorio_24h_enviado = FALSE
      AND (t.fecha + t.hora) BETWEEN (NOW() + INTERVAL '23 hours 50 minutes')
                                 AND (NOW() + INTERVAL '24 hours 10 minutes')
  `);
  return rows;
}


async function getTurnosPendientes2h() {
  const { rows } = await query(`
    SELECT t.*, u.email AS user_email, u.nombre AS user_nombre, u.nombre_negocio,
           s.nombre AS sucursal_nombre
    FROM turnos t
    JOIN usuarios u ON u.id = t.user_id
    LEFT JOIN sucursales s ON s.id = t.sucursal_id
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

// ─── RECORDATORIO DE REGRESO (recompra) ──────────────────────
// La depilación es cíclica: se avisa a las 3 semanas para que la
// clienta vuelva a la cuarta, cuando se cumple el mes.
const REGRESO_DIAS_AVISO = 21;   // a las 3 semanas
const REGRESO_DIAS_LIMITE = 40;  // más viejo que esto ya no se persigue
const REGRESO_MAX_POR_VUELTA = 15;

async function getClientasParaRegresar() {
  const { rows } = await query(`
    SELECT t.*, u.nombre AS user_nombre, u.nombre_negocio
      FROM turnos t
      JOIN usuarios u ON u.id = t.user_id
     WHERE t.estado != 'cancelado'
       AND t.recordatorio_regreso_enviado = FALSE
       AND t.telefono IS NOT NULL
       AND u.activo = TRUE
       AND t.fecha <= CURRENT_DATE - $1::int
       AND t.fecha >= CURRENT_DATE - $2::int
       -- Solo si es su ÚLTIMO turno: si ya volvió a agendar, no se le escribe
       AND NOT EXISTS (
         SELECT 1 FROM turnos t2
          WHERE t2.user_id  = t.user_id
            AND t2.telefono = t.telefono
            AND t2.estado  != 'cancelado'
            AND t2.fecha    > t.fecha
       )
     ORDER BY t.fecha ASC
     LIMIT $3::int
  `, [REGRESO_DIAS_AVISO, REGRESO_DIAS_LIMITE, REGRESO_MAX_POR_VUELTA]);
  return rows;
}

async function marcarRegresoEnviado(id) {
  await query(
    `UPDATE turnos SET recordatorio_regreso_enviado = TRUE WHERE id = $1`,
    [id]
  );
}

/** Hora local de Uruguay, para no escribirle a nadie de madrugada. */
function horaUruguay() {
  return Number(new Intl.DateTimeFormat('es-UY', {
    timeZone: 'America/Montevideo', hour: 'numeric', hour12: false,
  }).format(new Date()));
}

function mensajeRegreso(turno) {
  const nombre   = (turno.nombre || '').split(' ')[0] || 'Hola';
  const servicio = turno.servicio_nombre ? ` de *${turno.servicio_nombre}*` : '';

  let msg = `🌸 ¡Hola ${nombre}!\n\n`;
  msg += `Ya pasaron 3 semanas de tu última sesión${servicio}.\n\n`;
  msg += `Para que el tratamiento siga haciendo efecto conviene no cortar el ritmo: `;
  msg += `la próxima sería la semana que viene.\n\n`;
  msg += `¿Coordinamos? Respondeme este mensaje y te reservo un lugar 💗`;
  return msg;
}

async function enviarWhatsAppRegreso(turno) {
  const instance = `user_${turno.user_id}`;
  const estadoRes = await evolution.estadoInstancia(instance);

  if (!estadoRes.ok || estadoRes.estado !== 'open') {
    // Sin WhatsApp conectado no se marca como enviado: queda para cuando lo conecte.
    return { ok: false, error: 'wa_desconectado' };
  }

  const resultado = await evolution.enviarMensaje(instance, turno.telefono, mensajeRegreso(turno));
  if (!resultado.ok) return { ok: false, error: resultado.error };

  return { ok: true };
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
                  ✨ <strong>${turno.servicio_nombre}${turno.servicio_zona ? ' · ' + turno.servicio_zona : ''}</strong>
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
  const negocio  = turno.nombre_negocio || 'Tu estética';

  let msg = `🌸 *${negocio}*\n\n`;
  msg += `Hola ${turno.nombre}! 👋\n`;
  msg += `Te recordamos que tu turno es en *${etiqueta}*:\n\n`;
  msg += `📅 *${fecha}*\n`;
  msg += `🕐 *${hora} hs*\n`;
  if (turno.sucursal_nombre) {
    msg += `🏪 *${turno.sucursal_nombre}*\n`;
  }
  if (turno.servicio_nombre) {
    msg += `✨ *${turno.servicio_nombre}`;
    if (turno.servicio_zona) msg += ` · ${turno.servicio_zona}`;
    msg += `*\n`;
  }
  msg += `⏱ *${turno.duracion} minutos*\n\n`;

  // En el de 24 horas se le pide confirmar con un toque. En el de 2 horas
  // no: a esa altura ya no hay tiempo de ofrecerle el lugar a otra, y
  // pedir confirmación cuando ya no se puede hacer nada solo molesta.
  if (tipo === '24h' && turno.confirmacion_token) {
    msg += `¿Nos confirmás que venís? Es un toque 👇\n`;
    msg += `${APP_URL}/confirmar.html?t=${turno.confirmacion_token}\n\n`;
    msg += `Si no podés venir, avisanos desde ahí y le damos el lugar a otra clienta. ¡Gracias! 🌸`;
  } else {
    msg += `Si necesitás cancelar, avisanos con tiempo. ¡Gracias! 🌸`;
  }
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

  // ── 24 horas ──
   try {
    const turnos24h = await getTurnosPendientes24h();
    for (const turno of turnos24h) {
      let emailOk = false, waOk = false;
      try { await enviarEmailRecordatorio(turno, '24h'); emailOk = true; }
      catch (err) { console.error(`[CRON] ❌ Email 24h para ${turno.id}:`, err.message); }

      try { waOk = (await enviarWhatsAppAutomatico(turno, '24h')).ok; }
      catch (err) { console.error(`[CRON] ❌ WA 24h para ${turno.id}:`, err.message); }

      // Solo se marca enviado si al menos un canal llegó. Si fallaron los
      // dos, se deja sin marcar para que el cron lo reintente (la ventana
      // horaria de arriba dura ~20 min, asi que reintenta unas pocas veces
      // y no para siempre).
      if (emailOk || waOk) {
        await marcarEnviado24h(turno.id);
        console.log(`[CRON] ✅ Recordatorio 24h: ${turno.nombre} (${turno.id})`);
      } else {
        console.log(`[CRON] ⚠️ Recordatorio 24h falló en los dos canales, reintenta: ${turno.nombre} (${turno.id})`);
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  } catch (err) {
    console.error('[CRON] Error al obtener turnos 24h:', err.message);
  }

  // ── 2 horas ──
  try {
    const turnos2h = await getTurnosPendientes2h();
    for (const turno of turnos2h) {
      let emailOk = false, waOk = false;
      try { await enviarEmailRecordatorio(turno, '2h'); emailOk = true; }
      catch (err) { console.error(`[CRON] ❌ Email 2h para ${turno.id}:`, err.message); }

      try { waOk = (await enviarWhatsAppAutomatico(turno, '2h')).ok; }
      catch (err) { console.error(`[CRON] ❌ WA 2h para ${turno.id}:`, err.message); }

      if (emailOk || waOk) {
        await marcarEnviado2h(turno.id);
        console.log(`[CRON] ✅ Recordatorio 2h: ${turno.nombre} (${turno.id})`);
      } else {
        console.log(`[CRON] ⚠️ Recordatorio 2h falló en los dos canales, reintenta: ${turno.nombre} (${turno.id})`);
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  } catch (err) {
    console.error('[CRON] Error al obtener turnos 2h:', err.message);
  }

  // ── Regreso a las 3 semanas (recompra) ──
  // Solo en horario razonable: a nadie le gusta un mensaje comercial
  // a las 3 de la mañana.
  const hora = horaUruguay();
  if (hora < 9 || hora >= 20) {
    console.log(`[CRON] Regreso: fuera de horario (${hora}h en Uruguay), se posterga`);
    return;
  }

  try {
    const clientas = await getClientasParaRegresar();
    if (clientas.length) {
      console.log(`[CRON] Regreso: ${clientas.length} clienta(s) para contactar`);
    }

    for (const turno of clientas) {
      try {
        const r = await enviarWhatsAppRegreso(turno);
        if (r.ok) {
          await marcarRegresoEnviado(turno.id);
          console.log(`[CRON] ✅ Regreso enviado a ${turno.nombre}`);
        } else if (r.error === 'wa_desconectado') {
          // No se marca: se reintenta cuando la operadora conecte WhatsApp.
          console.log(`[CRON] Regreso: usuario ${turno.user_id} sin WhatsApp, se pospone`);
        } else {
          // Falló el envío en sí; se marca para no reintentar en bucle.
          await marcarRegresoEnviado(turno.id);
          console.error(`[CRON] ❌ Regreso a ${turno.nombre}:`, r.error);
        }
      } catch (err) {
        console.error(`[CRON] ❌ Regreso para turno ${turno.id}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 1200)); // no atropellar a Evolution
    }
  } catch (err) {
    console.error('[CRON] Error al buscar clientas para regreso:', err.message);
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
  if (turno.sucursal_nombre) {
    msg += `🏪 *${turno.sucursal_nombre}*\n`;
  }
  if (turno.servicio_nombre) {
    msg += `✨ *${turno.servicio_nombre}`;
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
    if (turno.sucursal_nombre) msg += `🏪 *${turno.sucursal_nombre}*\n`;
    if (turno.servicio_nombre) msg += `✨ *${turno.servicio_nombre}*\n`;
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
    if (turno.sucursal_nombre) msg += `🏪 *${turno.sucursal_nombre}*\n`;
    if (turno.servicio_nombre) msg += `✨ *${turno.servicio_nombre}*\n`;
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
    if (turno.sucursal_nombre) msg += `🏪 ~${turno.sucursal_nombre}~\n`;
    if (turno.servicio_nombre) msg += `✨ ~${turno.servicio_nombre}~\n`;
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


// ═══════════════════════════════════════════════════════════
//  AVISO AUTOMÁTICO DE PAGO PENDIENTE
//
//  Le recuerda a la clienta que quedó debiendo el servicio. Es
//  opcional y viene apagado: si la operadora cobró en efectivo y no lo
//  marcó en la app, esto le reclamaría a alguien que ya pagó.
//
//  Corre una vez por día a las 11 de la mañana. Un mensaje de cobro a
//  las 3 de la madrugada es peor que no mandarlo.
// ═══════════════════════════════════════════════════════════

const MAX_AVISOS_COBRO = 3;

async function getDeudasParaAvisar() {
  const { rows } = await query(`
    SELECT t.id, t.user_id, t.nombre, t.telefono, t.fecha, t.hora,
           t.servicio_nombre, t.cobro_avisos,
           COALESCE(s.precio, 0) AS precio,
           CASE WHEN t.senia_pagada THEN COALESCE(t.monto_senia, 0) ELSE 0 END AS senia,
           u.nombre_negocio, u.nombre AS user_nombre,
           u.cobro_aviso_dias    AS dias,
           u.cobro_aviso_repetir AS repetir
      FROM turnos t
      JOIN usuarios u ON u.id = t.user_id
      LEFT JOIN servicios s ON s.id = t.servicio_id
     WHERE u.cobro_aviso_activo = TRUE
       AND t.estado != 'cancelado'
       -- Si no vino, no se le reclama plata: no recibio el servicio.
       AND COALESCE(t.no_vino, FALSE) = FALSE
       AND t.telefono IS NOT NULL AND t.telefono <> ''
       AND t.fecha >= CURRENT_DATE - INTERVAL '6 months'
       AND COALESCE(t.cobro_avisos, 0) < ${MAX_AVISOS_COBRO}
       -- Solo si de verdad quedó sin cobrar
       AND NOT EXISTS (
         SELECT 1 FROM movimientos m
          WHERE m.turno_id = t.id AND m.categoria = 'Turno'
       )
       -- Y solo si el servicio tiene precio: sin precio no se puede
       -- reclamar un monto, y un reclamo sin monto confunde.
       AND COALESCE(s.precio, 0) > 0
       -- Primer aviso: pasaron los días de gracia que ella eligió.
       AND (t.fecha + t.hora) < NOW() - (u.cobro_aviso_dias || ' days')::interval
       -- Siguientes: solo si eligió repetir, y pasó ese intervalo.
       AND (
         COALESCE(t.cobro_avisos, 0) = 0
         OR (
           COALESCE(u.cobro_aviso_repetir, 0) > 0
           AND t.cobro_ultimo_aviso < NOW() - (u.cobro_aviso_repetir || ' days')::interval
         )
       )
     ORDER BY t.user_id, t.fecha
     LIMIT 200
  `);
  return rows;
}

function mensajeCobroPendiente(d) {
  const negocio = d.nombre_negocio || d.user_nombre || 'Tu estética';
  const nombre  = String(d.nombre || '').split(' ')[0];
  const fecha   = formatearFecha(d.fecha);
  const precio  = parseFloat(d.precio) || 0;
  const senia   = parseFloat(d.senia) || 0;
  const debe    = Math.max(precio - senia, 0);

  let msg = `🌸 *${negocio}*\n\n`;
  msg += `Hola ${nombre}! ¿Cómo estás?\n\n`;
  msg += `Te escribo por el turno del *${fecha}*`;
  if (d.servicio_nombre) msg += ` (${d.servicio_nombre})`;
  msg += `.\n\n`;
  msg += senia > 0
    ? `Quedó pendiente el saldo de *$${Math.round(debe)}*.\n\n`
    : `Quedó pendiente el pago de *$${Math.round(debe)}*.\n\n`;
  msg += `Cuando puedas me avisás 💕`;
  return msg;
}

async function procesarAvisosCobro() {
  try {
    const deudas = await getDeudasParaAvisar();
    if (!deudas.length) return;

    console.log(`[COBRO] ${deudas.length} aviso(s) de pago pendiente`);

    for (const d of deudas) {
      try {
        const instancia = `user_${d.user_id}`;
        const estado = await evolution.estadoInstancia(instancia);
        if (!estado.ok || estado.estado !== 'open') {
          console.log(`[COBRO] usuario ${d.user_id} sin WhatsApp conectado, salteo`);
          continue;
        }

        const r = await evolution.enviarMensaje(instancia, d.telefono, mensajeCobroPendiente(d));

        // Se cuenta el aviso aunque falle el envío: si el número está mal,
        // reintentarlo todos los días no lo va a arreglar.
        await query(
          `UPDATE turnos
              SET cobro_avisos = COALESCE(cobro_avisos, 0) + 1,
                  cobro_ultimo_aviso = NOW()
            WHERE id = $1`,
          [d.id]
        );

        console.log(`[COBRO] ${r.ok ? '✅' : '❌'} ${d.nombre} (turno ${d.id})`);
        await new Promise(res => setTimeout(res, 4000));

      } catch (err) {
        console.error(`[COBRO] error con el turno ${d.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[COBRO] error general:', err.message);
  }
}

cron.schedule('0 11 * * *', procesarAvisosCobro, { timezone: 'America/Montevideo' });

module.exports = {
  procesarRecordatorios,
  procesarAvisosCobro,
  testRecordatorioManual,
  enviarConfirmacionTurno,
  enviarConfirmacionSenia,
  enviarModificacionTurno,
  enviarCancelacionTurno,
  // Expuestos para poder probarlos sin tocar la base
  mensajeRegreso,
  horaUruguay,
};
