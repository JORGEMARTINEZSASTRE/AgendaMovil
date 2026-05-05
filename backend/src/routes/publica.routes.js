'use strict';

const express = require('express');
const router  = express.Router();
const { Pool } = require('pg');
const { autoRegistro } = require('../controllers/registroController');
const { registroLimiter } = require('../middleware/rateLimiter');
const { validarRegistro } = require('../middleware/validate');
const { body, validationResult } = require('express-validator');
const { enviarBienvenida } = require('../services/mailer');
const { encolar } = require('../services/waQueue');
const evolution = require('../services/evolution.service');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ─── Helpers ─────────────────────────────────────────────────
function toMin(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return (h * 60) + m;
}

function diaSemanaNumero(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`);
  return d.getDay(); // 0..6
}

function normalizarHorarios(horarios) {
  if (!Array.isArray(horarios)) return [];
  return horarios
    .map(h => ({
      dia: Number(h?.dia),
      desde: String(h?.desde || '').slice(0, 5),
      hasta: String(h?.hasta || '').slice(0, 5),
    }))
    .filter(h =>
      Number.isInteger(h.dia) &&
      h.dia >= 0 && h.dia <= 6 &&
      /^\d{2}:\d{2}$/.test(h.desde) &&
      /^\d{2}:\d{2}$/.test(h.hasta) &&
      h.desde < h.hasta
    );
}

function estaDentroHorario(horarios, fecha, hora, duracion) {
  const hs = normalizarHorarios(horarios);
  if (!hs.length) return true;
  const dia = diaSemanaNumero(fecha);

  const inicioTurno = toMin(hora);
  const finTurno = inicioTurno + Number(duracion || 0);

  return hs.some(b => Number(b.dia) === dia && inicioTurno >= toMin(b.desde) && finTurno <= toMin(b.hasta));
}

function formatearFecha(fechaStr) {
  const [a, m, d] = fechaStr.toString().split('T')[0].split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${a}`;
}

async function enviarMailNuevaTurnoEstetica({ emailEstetica, nombreEstetica, nombreClienta, telefonoClienta, fecha, hora, servicio, montoSenia }) {
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.MAIL_HOST, port: parseInt(process.env.MAIL_PORT)||587,
    secure: process.env.MAIL_SECURE==='true',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });

  const fechaStr = formatearFecha(fecha);
  const horaStr  = hora.slice(0,5);
  const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#FAF6F7;padding:24px;border-radius:14px;">
    <h2 style="color:#A85568;margin:0 0 16px;">🌸 Nueva solicitud de turno</h2>
    <p style="color:#4A3840;">Hola <strong>${nombreEstetica}</strong>, recibiste una nueva solicitud:</p>
    <table style="width:100%;background:#fff;border-radius:10px;padding:16px;margin:12px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">👤 Clienta</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${nombreClienta}</td></tr>
      <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">📞 Teléfono</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${telefonoClienta}</td></tr>
      <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">📅 Fecha</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${fechaStr}</td></tr>
      <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">🕐 Hora</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${horaStr} hs</td></tr>
      ${servicio ? `<tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">✂️ Servicio</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${servicio}</td></tr>` : ''}
    </table>
    ${montoSenia ? `<div style="background:rgba(168,85,104,.08);border:1.5px solid rgba(168,85,104,.2);border-radius:10px;padding:12px 16px;margin:12px 0;">
      <p style="margin:0;color:#A85568;font-weight:700;font-size:14px;">⚠️ Turno pendiente de seña</p>
      <p style="margin:6px 0 0;color:#4A3840;font-size:13px;">La clienta debe abonar <strong>$${montoSenia}</strong> para confirmar el turno.</p>
    </div>` : ''}
    <p style="color:#9A8F92;font-size:12px;margin-top:16px;">© 2025 DEPIMÓVIL PRO</p>
  </div>`;
  try {
    await t.sendMail({
      from: `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
      to: emailEstetica,
      subject: `🌸 Nueva solicitud de turno — ${nombreClienta}`,
      text: `Nueva solicitud de ${nombreClienta} para el ${fechaStr} a las ${horaStr}.`,
      html,
    });
    console.log(`[MAILER] Notif estetica enviada a ${emailEstetica}`);
  } catch(err) { console.error('[MAILER] Error notif estetica:', err.message); }
}

async function enviarMailSeniaPendienteClienta({ emailClienta, nombreClienta, nombreEstetica, telefonoEstetica, fecha, hora, servicio, montoSenia }) {
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.MAIL_HOST, port: parseInt(process.env.MAIL_PORT)||587,
    secure: process.env.MAIL_SECURE==='true',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  const fechaStr = formatearFecha(fecha);
  const horaStr  = hora.slice(0,5);
  const telLimpio = (telefonoEstetica||'').replace(/\D/g,'');
  const msgWA = encodeURIComponent(`Hola ${nombreEstetica}! 🌸 Me agendé para el ${fechaStr} a las ${horaStr}${servicio ? ` (${servicio})` : ''}. Quería coordinar el pago de la seña de $${montoSenia}. ¡Gracias!`);
  const waLink = telLimpio ? `https://wa.me/${telLimpio}?text=${msgWA}` : null;

  const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#FAF6F7;padding:24px;border-radius:14px;">
    <h2 style="color:#A85568;margin:0 0 16px;">🌸 Solicitud recibida — DEPIMÓVIL PRO</h2>
    <p style="color:#4A3840;">Hola <strong>${nombreClienta}</strong>, tu solicitud fue recibida:</p>
    <table style="width:100%;background:#fff;border-radius:10px;padding:16px;margin:12px 0;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">📅 Fecha</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${fechaStr}</td></tr>
      <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">🕐 Hora</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${horaStr} hs</td></tr>
      ${servicio ? `<tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">✂️ Servicio</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${servicio}</td></tr>` : ''}
    </table>
    <div style="background:rgba(168,85,104,.08);border:1.5px solid rgba(168,85,104,.2);border-radius:10px;padding:14px 16px;margin:12px 0;">
      <p style="margin:0 0 8px;color:#A85568;font-weight:700;font-size:14px;">⚠️ Tu turno no está confirmado todavía</p>
      <p style="margin:0 0 8px;color:#4A3840;font-size:13px;line-height:1.6;">Para confirmar tu lugar, necesitás abonar una seña de <strong>$${montoSenia}</strong>.</p>
      <p style="margin:0;color:#4A3840;font-size:13px;">Contactate con <strong>${nombreEstetica}</strong> para coordinar el pago:</p>
      ${waLink ? `<a href="${waLink}" style="display:inline-block;background:#25D366;color:white;font-weight:700;padding:10px 20px;border-radius:100px;text-decoration:none;margin-top:12px;font-size:14px;">💬 Escribir por WhatsApp</a>` : `<p style="margin:4px 0 0;color:#A85568;font-weight:700;">${telefonoEstetica}</p>`}
    </div>
    <p style="color:#9A8F92;font-size:12px;margin-top:16px;">© 2025 DEPIMÓVIL PRO</p>
  </div>`;
  try {
    await t.sendMail({
      from: `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
      to: emailClienta,
      subject: `🌸 Reserva recibida — confirmá tu seña`,
      text: `Hola ${nombreClienta}, tu reserva fue recibida. Abonando la seña de $${montoSenia} confirmás tu turno.`,
      html,
    });
    console.log(`[MAILER] Mail seña clienta enviado a ${emailClienta}`);
  } catch(err) { console.error('[MAILER] Error mail seña clienta:', err.message); }
}
// ═══════════════════════════════════════════════════════════
//  WHATSAPP — Reserva confirmada (sin seña)
// ═══════════════════════════════════════════════════════════
async function enviarWAReservaConfirmada({ userId, telefono, nombre, fecha, hora, servicio, duracion }) {
  try {
    if (!telefono) return;

    const instance = `user_${userId}`;
    const estado = await evolution.estadoInstancia(instance);
    if (!estado.ok || estado.estado !== 'open') {
      console.log(`[WA-PUB] Usuario ${userId} sin WhatsApp conectado`);
      return;
    }

    const fechaStr = formatearFecha(fecha);
    const horaStr  = hora.slice(0, 5);

    let msg = `🌸 *Turno confirmado*\n\n`;
    msg += `¡Hola ${nombre}! 👋\n\n`;
    msg += `Tu turno quedó agendado:\n\n`;
    msg += `📅 *${fechaStr}*\n`;
    msg += `🕐 *${horaStr} hs*\n`;
    if (servicio) msg += `✂️ *${servicio}*\n`;
    if (duracion) msg += `⏱ *${duracion} minutos*\n`;
    msg += `\n¡Te esperamos! 🌸\n`;
    msg += `Si necesitás cancelar o reprogramar, avisanos con tiempo.`;

    const result = await evolution.enviarMensaje(instance, telefono, msg);
    if (result.ok) {
      console.log(`[WA-PUB] ✅ Confirmación enviada a ${nombre} (${telefono})`);
    } else {
      console.error(`[WA-PUB] ❌ Error:`, result.error);
    }
  } catch (err) {
    console.error(`[WA-PUB] Error general:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  WHATSAPP — Reserva con seña pendiente
// ═══════════════════════════════════════════════════════════
async function enviarWAReservaPendienteSenia({ userId, telefono, nombre, fecha, hora, servicio, montoSenia, nombreEstetica }) {
  try {
    if (!telefono) return;

    const instance = `user_${userId}`;
    const estado = await evolution.estadoInstancia(instance);
    if (!estado.ok || estado.estado !== 'open') {
      console.log(`[WA-PUB] Usuario ${userId} sin WhatsApp conectado`);
      return;
    }

    const fechaStr = formatearFecha(fecha);
    const horaStr  = hora.slice(0, 5);

    let msg = `🌸 *Solicitud recibida*\n\n`;
    msg += `¡Hola ${nombre}! 👋\n\n`;
    msg += `Tu solicitud de turno fue recibida:\n\n`;
    msg += `📅 *${fechaStr}*\n`;
    msg += `🕐 *${horaStr} hs*\n`;
    if (servicio) msg += `✂️ *${servicio}*\n`;
    msg += `\n⚠️ *Tu turno aún NO está confirmado*\n\n`;
    msg += `Para confirmarlo, necesitás abonar la seña de *$${montoSenia}*.\n\n`;
    msg += `Respondé este mensaje para coordinar el pago. 💰\n\n`;
    msg += `Una vez abonada, recibirás la confirmación 🌸`;

    const result = await evolution.enviarMensaje(instance, telefono, msg);
    if (result.ok) {
      console.log(`[WA-PUB] ✅ Aviso seña enviado a ${nombre} (${telefono})`);
    } else {
      console.error(`[WA-PUB] ❌ Error:`, result.error);
    }
  } catch (err) {
    console.error(`[WA-PUB] Error general:`, err.message);
  }
}
// ═══════════════════════════════════════════════════════════
// RUTAS ESTÁTICAS (van ANTES de las rutas con :userId)
// ═══════════════════════════════════════════════════════════

// ─── POST /api/publica/registro ──────────────────────────────
router.post('/registro', registroLimiter, validarRegistro, autoRegistro);

// ═══════════════════════════════════════════════════════════
// RUTAS DINÁMICAS (con parámetros)
// ═══════════════════════════════════════════════════════════

// ─── GET /api/publica/:userId/info ───────────────────────────
router.get('/:userId/info', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT nombre, nombre_negocio, telefono, email, logo_url
       FROM usuarios WHERE id = $1 AND activo = true AND rol = 'cliente'`,
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Agenda no encontrada' });
    return res.json({ ok: true, info: rows[0] });
  } catch(err) {
    console.error('[PUBLICA/info]', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.get('/:userId/sucursales', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, tipo, horarios
       FROM sucursales
       WHERE user_id = $1 AND activo = true
       ORDER BY created_at DESC`,
      [req.params.userId]
    );
    return res.json({ ok: true, sucursales: rows });
  } catch (err) {
    console.error('[PUBLICA/sucursales]', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ─── GET /api/publica/:userId/disponibilidad ─────────────────
router.get('/:userId/disponibilidad', async (req, res) => {
  try {
    const { fecha, sucursal_id } = req.query;
    if (!fecha) return res.status(400).json({ ok: false, error: 'Fecha requerida' });
    if (!sucursal_id) return res.status(400).json({ ok: false, error: 'Sucursal requerida' });

    const { rows: sucRows } = await pool.query(
      `SELECT id, horarios
       FROM sucursales
       WHERE id = $1 AND user_id = $2 AND activo = true`,
      [sucursal_id, req.params.userId]
    );
    if (!sucRows.length) return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });

    const horarios = normalizarHorarios(sucRows[0].horarios || []);
    const dia = diaSemanaNumero(fecha);
    const bloquesDia = horarios.filter(h => h.dia === dia);

    const { rows } = await pool.query(
      `SELECT hora, duracion
       FROM turnos
       WHERE user_id = $1
         AND fecha = $2
         AND estado != 'cancelado'
         AND sucursal_id = $3`,
      [req.params.userId, fecha, sucursal_id]
    );

    return res.json({ ok: true, ocupados: rows, bloques: bloquesDia });
  } catch(err) {
    console.error('[PUBLICA/disponibilidad]', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ─── GET /api/publica/:userId/servicios ──────────────────────
router.get('/:userId/servicios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, zona, duracion, color, categoria,
              requiere_senia, monto_senia, precio, descripcion, foto_url
       FROM servicios WHERE user_id = $1 AND activo = true ORDER BY categoria, nombre`,
      [req.params.userId]
    );
    return res.json({ ok: true, servicios: rows });
  } catch(err) {
    console.error('[PUBLICA/servicios]', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ─── POST /api/publica/:userId/turno ─────────────────────────
router.post('/:userId/turno', [
  body('nombre').trim().notEmpty().isLength({ min: 2, max: 255 }),
  body('telefono').trim().notEmpty(),
  body('fecha').matches(/^\d{4}-\d{2}-\d{2}$/),
  body('hora').matches(/^\d{2}:\d{2}$/),
  body('duracion').isInt({ min: 5, max: 480 }),
  body('sucursal_id').trim().notEmpty(),
], async (req, res) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ ok: false, error: 'Datos inválidos' });
  }

  try {
    const { userId } = req.params;
    const { nombre, telefono, fecha, hora, duracion,
            servicio_id, servicio_nombre, servicio_zona,
            servicio_color, notas, email_clienta, sucursal_id } = req.body;

    // Verificar usuario
    const { rows: usuRows } = await pool.query(
      `SELECT id, email, nombre, nombre_negocio, telefono
       FROM usuarios WHERE id = $1 AND activo = true`,
      [userId]
    );
    if (!usuRows.length) return res.status(404).json({ ok: false, error: 'Agenda no encontrada' });
    const estetica = usuRows[0];

    // Validar sucursal y horarios
    const { rows: sucRows } = await pool.query(
      `SELECT id, horarios
       FROM sucursales
       WHERE id = $1 AND user_id = $2 AND activo = true`,
      [sucursal_id, userId]
    );
    if (!sucRows.length) {
      return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
    }

    if (!estaDentroHorario(sucRows[0].horarios, fecha, hora, duracion)) {
      return res.status(409).json({
        ok: false,
        error: 'Ese horario está fuera de disponibilidad de la sucursal',
      });
    }

    // Verificar conflicto
    const horaMin = parseInt(hora.split(':')[0])*60 + parseInt(hora.split(':')[1]);
    const horaFin = horaMin + parseInt(duracion);
    const { rows: ocupados } = await pool.query(
      `SELECT hora, duracion
       FROM turnos
       WHERE user_id = $1
         AND fecha = $2
         AND estado != 'cancelado'
         AND sucursal_id = $3`,
      [userId, fecha, sucursal_id]
    );
    for (const t of ocupados) {
      const tMin = parseInt(t.hora.split(':')[0])*60 + parseInt(t.hora.split(':')[1]);
      if (horaMin < tMin + parseInt(t.duracion) && horaFin > tMin) {
        return res.status(409).json({ ok: false, error: 'Ese horario ya está ocupado. Elegí otro.' });
      }
    }

    // Obtener seña del servicio si aplica
    let seniaRequerida = false;
    let montoSenia     = 0;
    let estadoPago     = 'no_aplica';
    let estadoTurno    = 'activo';

    if (servicio_id) {
      const { rows: sRows } = await pool.query(
        `SELECT requiere_senia, monto_senia FROM servicios WHERE id = $1 AND user_id = $2`,
        [servicio_id, userId]
      );
      if (sRows.length && sRows[0].requiere_senia && sRows[0].monto_senia > 0) {
        seniaRequerida = true;
        montoSenia     = sRows[0].monto_senia;
        estadoPago     = 'pendiente';
        estadoTurno    = 'pendiente_senia';
      }
    }

    // Crear turno
    const { rows: tRows } = await pool.query(
      `INSERT INTO turnos
         (user_id, nombre, telefono, fecha, hora, duracion,
          servicio_id, servicio_nombre, servicio_zona, servicio_color,
          notas, estado, sucursal_id,
          senia_requerida, senia_pagada, monto_senia, estado_pago)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        userId, nombre, telefono, fecha, hora, duracion,
        servicio_id || null, servicio_nombre || null,
        servicio_zona || null, servicio_color || '#A85568',
        notas || null, estadoTurno, sucursal_id,
        seniaRequerida, false, montoSenia, estadoPago,
      ]
    );
    const turno = tRows[0];

    // ── Mails ──
    const servicioLabel = servicio_nombre || null;

    // Notificar a la estética siempre
    enviarMailNuevaTurnoEstetica({
      emailEstetica:    estetica.email,
      nombreEstetica:   estetica.nombre_negocio || estetica.nombre,
      nombreClienta:    nombre,
      telefonoClienta:  telefono,
      fecha, hora,
      servicio:         servicioLabel,
      montoSenia:       seniaRequerida ? montoSenia : null,
    });

    // Si tiene seña y la clienta dejó su email, avisarle
    if (seniaRequerida && email_clienta) {
      enviarMailSeniaPendienteClienta({
        emailClienta:     email_clienta,
        nombreClienta:    nombre,
        nombreEstetica:   estetica.nombre_negocio || estetica.nombre,
        telefonoEstetica: estetica.telefono,
        fecha, hora,
        servicio:         servicioLabel,
        montoSenia,
      });
    }
    if (seniaRequerida) {
      encolar({
        userId,
        turnoId: turno.id,
        tipo: 'senia_pendiente',
        nombre,
        telefono,
        datos: [turno, estetica],
        fechaEvento: fecha,
      });
    } else {
      encolar({
        userId,
        turnoId: turno.id,
        tipo: 'reserva_confirmada',
        nombre,
        telefono,
        datos: [turno, estetica],
        fechaEvento: fecha,
      });
    }
        // ── WhatsApp automático a la clienta ──
    if (seniaRequerida) {
      enviarWAReservaPendienteSenia({
        userId,
        telefono,
        nombre,
        fecha,
        hora,
        servicio: servicioLabel,
        montoSenia,
        nombreEstetica: estetica.nombre_negocio || estetica.nombre,
      });
    } else {
      enviarWAReservaConfirmada({
        userId,
        telefono,
        nombre,
        fecha,
        hora,
        servicio: servicioLabel,
        duracion,
      });
    }

       return res.status(201).json({
      ok:     true,
      mensaje: seniaRequerida
        ? '¡Solicitud recibida! Coordina el pago de la seña para confirmar.'
        : '¡Turno agendado exitosamente!',
      turno,
    });

  } catch(err) {
    console.error('[PUBLICA/turno]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear el turno' });
  }
});

module.exports = router;