'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Usuarios, Invitaciones } = require('../models/queries');
const { enviarBienvenida, enviarCambioPlan, enviarCuentaBaja, enviarCuentaEliminada } = require('../services/mailer');

function basePublica(req) {
  const base = process.env.PUBLIC_APP_URL
    || process.env.APP_URL
    || process.env.FRONTEND_URL
    || process.env.CORS_ORIGIN
    || `${req.protocol}://${req.get('host')}`;

  return String(base).split(',')[0].trim().replace(/\/$/, '');
}

async function enviarMailInvitacionOperadora({ email, urlActivacion, plan, diasTrial }) {
  const t = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    family: 4,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });

  const diasTexto = plan === 'trial' ? `${diasTrial} días gratis` : 'plan premium';

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#FAF6F7;padding:24px;border-radius:14px;">
    <div style="background:#A85568;border-radius:10px 10px 0 0;padding:24px;text-align:center;">
      <p style="margin:0;font-size:28px;">🌸</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">DEPIMÓVIL PRO</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Tu agenda profesional</p>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;">
      <h2 style="color:#4A3840;font-size:18px;margin:0 0 12px;">Activá tu cuenta 🌸</h2>
      <p style="color:#6B5A60;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Te invitaron a crear tu cuenta en AgendaMóvil PRO con ${diasTexto}.
      </p>
      <div style="text-align:center;margin:22px 0;">
        <a href="${urlActivacion}" style="display:inline-block;background:#A85568;color:white;font-weight:700;padding:14px 28px;border-radius:100px;text-decoration:none;font-size:15px;">
          ✅ Activar mi cuenta
        </a>
      </div>
      <p style="color:#9A8F92;font-size:13px;margin:16px 0 0;text-align:center;line-height:1.5;">
        Si el botón no abre, copiá y pegá este link en el navegador:<br>
        <a href="${urlActivacion}" style="color:#A85568;word-break:break-all;">${urlActivacion}</a>
      </p>
    </div>
    <p style="color:#9A8F92;font-size:12px;margin-top:16px;text-align:center;">© 2026 DEPIMÓVIL PRO</p>
  </div>`;

  await t.sendMail({
    from: `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
    to: email,
    subject: '🌸 Activá tu cuenta de AgendaMóvil PRO',
    text: `Activá tu cuenta de AgendaMóvil PRO acá: ${urlActivacion}`,
    html,
  });
}

async function listarUsuarios(req, res) {
  try {
    const usuarios = await Usuarios.listarTodos();
    return res.json({ ok: true, usuarios, total: usuarios.length });
  } catch (err) {
    console.error('[ADMIN/listarUsuarios]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
  }
}

async function crearUsuario(req, res) {
  try {
    const { email, password, nombre, plan, dias_trial, nombre_negocio, telefono, rol } = req.body;
    const existente = await Usuarios.buscarPorEmail(email);
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese email' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const diasTrial    = parseInt(dias_trial) || 30;
    const trialInicio  = new Date();
    const trialFin     = new Date();
    trialFin.setDate(trialFin.getDate() + diasTrial);
    const usuario = await Usuarios.crear({
      email,
      passwordHash,
      nombre,
      rol:           rol === 'admin' ? 'admin' : 'cliente',
      plan:          plan || 'trial',
      trialInicio:   plan === 'trial' ? trialInicio : null,
      trialFin:      plan === 'trial' ? trialFin    : null,
      nombreNegocio: nombre_negocio || null,
      telefono:      telefono       || null,
    });
    return res.status(201).json({ ok: true, mensaje: 'Usuario creado exitosamente', usuario });
  } catch (err) {
    console.error('[ADMIN/crearUsuario]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear el usuario' });
  }
}

async function toggleActivo(req, res) {
  try {
    const { activo } = req.body;
    if (req.params.id === req.user.id) {
      return res.status(400).json({ ok: false, error: 'No podes desactivar tu propia cuenta' });
    }

    const usuarioCompleto = await Usuarios.buscarPorId(req.params.id);
    if (!usuarioCompleto) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (usuarioCompleto.rol === 'admin') {
      return res.status(403).json({ ok: false, error: 'No se puede desactivar un administrador' });
    }
    if (!usuarioCompleto) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const usuario = await Usuarios.toggleActivo(req.params.id, activo);

    // ── Enviar mail según estado ──
    if (!activo) {
      enviarCuentaBaja({ nombre: usuarioCompleto.nombre, email: usuarioCompleto.email });
    }

    return res.json({ ok: true, mensaje: `Cuenta ${activo ? 'activada' : 'desactivada'} exitosamente`, usuario });
  } catch (err) {
    console.error('[ADMIN/toggleActivo]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al cambiar estado de la cuenta' });
  }
}

async function cambiarPlan(req, res) {
  try {
    const { plan, dias_trial } = req.body;
    let trialFin = null;
    if (plan === 'trial' && dias_trial) {
      trialFin = new Date();
      trialFin.setDate(trialFin.getDate() + parseInt(dias_trial));
      trialFin = trialFin.toISOString();
    }
    const usuario = await Usuarios.cambiarPlan(req.params.id, plan, trialFin);
    if (!usuario) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    // ── Enviar mail de cambio de plan ──
    enviarCambioPlan({
      nombre:   usuario.nombre,
      email:    usuario.email,
      plan,
      trialFin: plan === 'trial' && trialFin ? new Date(trialFin) : null,
    });

    return res.json({ ok: true, mensaje: `Plan actualizado a ${plan}`, usuario });
  } catch (err) {
    console.error('[ADMIN/cambiarPlan FULL]', err);
    return res.status(500).json({ ok: false, error: 'Error al cambiar el plan' });
  }
}

async function eliminarUsuario(req, res) {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ ok: false, error: 'No podes eliminar tu propia cuenta' });
    }
    const existente = await Usuarios.buscarPorId(req.params.id);
    if (!existente) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (existente.rol === 'admin') {
      return res.status(403).json({ ok: false, error: 'No se puede eliminar un administrador' });
    }
    await Usuarios.eliminar(req.params.id);

    // ── Enviar mail de cuenta eliminada ──
    enviarCuentaEliminada({ nombre: existente.nombre, email: existente.email });

    return res.json({ ok: true, mensaje: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('[ADMIN/eliminarUsuario]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar el usuario' });
  }
}

async function crearInvitacion(req, res) {
  try {
    const { email, plan, dias_trial } = req.body;
    const existente = await Usuarios.buscarPorEmail(email);
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese email' });
    }

    const planFinal = plan || 'trial';
    const diasTrial = parseInt(dias_trial) || 30;
    const token = crypto.randomBytes(32).toString('hex');

    const invitacion = await Invitaciones.crear({
      token,
      email,
      plan: planFinal,
      diasTrial,
      creadoPor: req.user.id,
    });

    const urlActivacion = `${basePublica(req)}/login.html?inv=${encodeURIComponent(token)}`;

    let mailEnviado = true;
    try {
      await enviarMailInvitacionOperadora({
        email,
        urlActivacion,
        plan: planFinal,
        diasTrial,
      });
    } catch (mailErr) {
      mailEnviado = false;
      console.error('[ADMIN/crearInvitacion/mail]', mailErr.message);
    }

    return res.status(201).json({
      ok: true,
      mensaje: mailEnviado
        ? 'Invitacion creada y enviada por mail exitosamente'
        : 'Invitacion creada, pero no se pudo enviar el mail',
      mail_enviado: mailEnviado,
      invitacion: { ...invitacion, url_activacion: urlActivacion },
    });
  } catch (err) {
    console.error('[ADMIN/crearInvitacion]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear la invitacion' });
  }
}

async function listarInvitaciones(req, res) {
  try {
    const invitaciones = await Invitaciones.listar(req.user.id);
    return res.json({ ok: true, invitaciones, total: invitaciones.length });
  } catch (err) {
    console.error('[ADMIN/listarInvitaciones]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener invitaciones' });
  }
}

module.exports = { listarUsuarios, crearUsuario, toggleActivo, cambiarPlan, eliminarUsuario, crearInvitacion, listarInvitaciones };
