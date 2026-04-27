'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Usuarios } = require('../models/queries');
const env = require('../config/env');
const mailer = require('../services/mailer');

async function autoRegistro(req, res) {
  try {
    const { nombre, email, password, telefono, codigo_pais } = req.body;

    // Verificar email único
    const existente = await Usuarios.buscarPorEmailSimple(email);
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese email' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear usuario con trial 14 días
    const usuario = await Usuarios.crearAutoRegistro({
      nombre: nombre.trim(),
      email,
      passwordHash,
      telefono,
      codigo_pais: codigo_pais || '+598',
    });

    // Mail de bienvenida (no bloquea si falla)
    try {
      if (mailer.enviarBienvenida) {
        await mailer.enviarBienvenida({
          email: usuario.email,
          nombre: usuario.nombre,
        });
      }
    } catch (e) {
      console.error('[registro] Error mail bienvenida:', e.message);
    }

    // JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol || 'cliente' },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    return res.status(201).json({
      ok: true,
      mensaje: '¡Cuenta creada! Tenés 14 días de prueba gratis.',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        plan: usuario.plan,
        trial_fin: usuario.trial_fin,
        rol: usuario.rol || 'cliente',
      },
    });
  } catch (err) {
    console.error('[registro] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error al crear la cuenta' });
  }
}

module.exports = { autoRegistro };