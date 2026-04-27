'use strict';

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const {
  Usuarios,
  Invitaciones,
  LoginIntentos,
} = require('../models/queries');
const { enviarBienvenida } = require('../services/mailer');

function generarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, rol: usuario.rol, plan: usuario.plan },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function datosPublicos(u) {
  return {
    id:             u.id,
    email:          u.email,
    nombre:         u.nombre,
    rol:            u.rol,
    plan:           u.plan,
    trial_inicio:   u.trial_inicio,
    trial_fin:      u.trial_fin,
    activo:         u.activo,
    nombre_negocio: u.nombre_negocio,
  };
}

async function login(req, res) {
  const { email, password } = req.body;
  const ip = req.ip;
  try {
    await LoginIntentos.limpiarViejos();
    const intentosFallidos = await LoginIntentos.contarFallidos(email, ip, 15);
    if (intentosFallidos >= 8) {
      return res.status(429).json({ ok: false, error: 'Demasiados intentos fallidos. Espera 15 minutos.' });
    }
    const usuario = await Usuarios.buscarPorEmail(email);
    if (!usuario) {
      await LoginIntentos.registrar(email, ip, false);
      return res.status(401).json({ ok: false, error: 'Email o contrasena incorrectos' });
    }
    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      await LoginIntentos.registrar(email, ip, false);
      return res.status(401).json({ ok: false, error: 'Email o contrasena incorrectos' });
    }
    if (!usuario.activo) {
      return res.status(403).json({ ok: false, error: 'Cuenta desactivada. Contacta al administrador.' });
    }
    await LoginIntentos.registrar(email, ip, true);
    await Usuarios.actualizarUltimoLogin(usuario.id);
    const token = generarToken(usuario);
    return res.json({ ok: true, token, usuario: datosPublicos(usuario) });
  } catch (err) {
    console.error('[AUTH/login]', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno al iniciar sesion' });
  }
}

async function me(req, res) {
  try {
    const usuario = await Usuarios.buscarPorId(req.user.id);
    if (!usuario) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    return res.json({ ok: true, usuario: datosPublicos(usuario) });
  } catch (err) {
    console.error('[AUTH/me]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al verificar sesion' });
  }
}

async function activarInvitacion(req, res) {
  const { token, nombre, nombre_negocio, password } = req.body;
  try {
    const invitacion = await Invitaciones.buscarPorToken(token);
    if (!invitacion) {
      return res.status(400).json({ ok: false, error: 'Codigo de invitacion invalido o expirado' });
    }
    const existente = await Usuarios.buscarPorEmail(invitacion.email);
    if (existente) {
      return res.status(400).json({ ok: false, error: 'Este email ya tiene una cuenta registrada' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const trialInicio  = new Date();
    const trialFin     = new Date();
    trialFin.setDate(trialFin.getDate() + invitacion.dias_trial);

    const nuevoUsuario = await Usuarios.crear({
      email:         invitacion.email,
      passwordHash,
      nombre,
      rol:           'cliente',
      plan:          invitacion.plan,
      trialInicio:   invitacion.plan === 'trial' ? trialInicio : null,
      trialFin:      invitacion.plan === 'trial' ? trialFin    : null,
      nombreNegocio: nombre_negocio || null,
    });

    await Invitaciones.marcarUsada(invitacion.id);

    // ── Enviar mail de bienvenida (no bloquea el registro si falla) ──
    enviarBienvenida({
      nombre,
      nombreNegocio: nombre_negocio || null,
      email:         invitacion.email,
      plan:          invitacion.plan,
      trialFin:      invitacion.plan === 'trial' ? trialFin : null,
    });

    const jwtToken = generarToken(nuevoUsuario);
    return res.status(201).json({
      ok:      true,
      mensaje: 'Cuenta activada exitosamente!',
      token:   jwtToken,
      usuario: datosPublicos(nuevoUsuario),
    });
  } catch (err) {
    console.error('[AUTH/activarInvitacion]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al activar la cuenta' });
  }
}

module.exports = { login, me, activarInvitacion };