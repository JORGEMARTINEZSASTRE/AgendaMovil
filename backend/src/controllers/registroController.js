'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Usuarios } = require('../models/queries');
const { query } = require('../config/db');
const env = require('../config/env');
const mailer = require('../services/mailer');

const DIAS_TRIAL_AUTOREGISTRO = 30;

function generarSlugBase(texto) {
  return (texto || 'negocio')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function generarSlugUnico(nombre, excludeId) {
  const base = generarSlugBase(nombre);
  let slug = base;
  let n = 2;
  while (true) {
    const params = excludeId ? [slug, excludeId] : [slug];
    const where = excludeId ? 'slug = $1 AND id != $2' : 'slug = $1';
    const { rows } = await query(`SELECT 1 FROM usuarios WHERE ${where}`, params);
    if (!rows.length) return slug;
    slug = base + '-' + n++;
  }
}

async function crearUsuarioAutoRegistro30Dias({ nombre, email, passwordHash, telefono, codigo_pais, slug }) {
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
       (nombre, email, password_hash, telefono, slug,
        plan, trial_inicio, trial_fin, activo, rol)
     VALUES ($1, $2, $3, $4, $5, 'trial', NOW(), NOW() + ($6::int * INTERVAL '1 day'), true, 'cliente')
     RETURNING id, nombre, email, plan, trial_fin, rol, activo, slug`,
    [nombre, email.toLowerCase().trim(), passwordHash, telefonoCompleto, slug, DIAS_TRIAL_AUTOREGISTRO]
  );
  return rows[0];
}

async function autoRegistro(req, res) {
  try {
    const { nombre, email, password, telefono, codigo_pais } = req.body;

    const existente = await Usuarios.buscarPorEmailSimple(email);
    if (existente) {
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const slug = await generarSlugUnico(nombre.trim());

    const usuario = await crearUsuarioAutoRegistro30Dias({
      nombre: nombre.trim(),
      email,
      passwordHash,
      telefono,
      codigo_pais: codigo_pais || '+598',
      slug,
    });

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
        slug: usuario.slug,
      },
    });
  } catch (err) {
    console.error('[registro] Error:', err);
    return res.status(500).json({ ok: false, error: 'Error al crear la cuenta' });
  }
}

module.exports = { autoRegistro, generarSlugUnico };
