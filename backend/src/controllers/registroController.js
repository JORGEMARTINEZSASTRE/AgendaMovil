'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Usuarios } = require('../models/queries');
const { query } = require('../config/db');
const env = require('../config/env');
const mailer = require('../services/mailer');

const DIAS_TRIAL_AUTOREGISTRO = 30;

async function crearUsuarioAutoRegistro30Dias({ nombre, email, passwordHash, telefono, codigo_pais }) {
  let telefonoCompleto = null;
  if (telefono) {
    const limpio = String(telefono).replace(/\D/g, '').replace(/^0+/, '');
    if (limpio) {
      const prefijo = (codigo_pais || '+598').replace(/\D/g, '');
      telefonoCompleto = `+${prefijo}${limpio}`;
    }
  }

  const { rows } = await query(
    `INSERT INTO usuarios
       (nombre, email, password_hash, telefono,
        plan, trial_inicio, trial_fin, activo, rol)
     VALUES ($1, $2, $3, $4, 'trial', NOW(), NOW() + ($5::int * INTERVAL '1 day'), true, 'cliente')
     RETURNING id, nombre, email, plan, trial_fin, rol, activo`,
    [nombre, email.toLowerCase().trim(), passwordHash, telefonoCompleto, DIAS_TRIAL_AUTOREGISTRO]
  );
  return rows[0];
}

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

    // Crear usuario con trial de 30 días para el primer link compartido con operadoras
    const usuario = await crearUsuarioAutoRegistro30Dias({
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
      mensaje: '¡Cuenta creada! Tenés 30 días de prueba gratis.',
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
