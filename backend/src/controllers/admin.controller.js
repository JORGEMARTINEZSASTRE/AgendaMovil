'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Usuarios, Invitaciones } = require('../models/queries');
const { enviarBienvenida, enviarCambioPlan, enviarCuentaBaja, enviarCuentaEliminada } = require('../services/mailer');

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
    const { email, password, nombre, plan, dias_trial, nombre_negocio, telefono } = req.body;
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
      rol:           'cliente',
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

    // Buscar primero para tener nombre completo
    const usuarioCompleto = await Usuarios.buscarPorId(req.params.id);
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
    const token      = crypto.randomBytes(32).toString('hex');
    const invitacion = await Invitaciones.crear({
      token,
      email,
      plan:      plan      || 'trial',
      diasTrial: dias_trial || 30,
      creadoPor: req.user.id,
    });
    const urlActivacion = `${process.env.CORS_ORIGIN}/login.html?inv=${token}`;
    return res.status(201).json({ ok: true, mensaje: 'Invitacion creada exitosamente', invitacion: { ...invitacion, url_activacion: urlActivacion } });
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