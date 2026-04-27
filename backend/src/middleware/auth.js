'use strict';

const jwt         = require('jsonwebtoken');
const { query }   = require('../config/db');
const { jwtSecret } = require('../config/env');

/**
 * Verifica JWT y carga usuario desde DB.
 * SIEMPRE verifica en DB — no confiar solo en el token.
 */
async function autenticar(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token requerido' });
    }

    const token = header.slice(7);

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError'
        ? 'Sesión expirada. Iniciá sesión nuevamente.'
        : 'Token inválido.';
      return res.status(401).json({ ok: false, error: msg });
    }

    // Verificar usuario en DB (puede haber sido desactivado)
    const { rows } = await query(
      `SELECT id, email, nombre, rol, plan, trial_fin, activo
       FROM usuarios WHERE id = $1`,
      [payload.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const u = rows[0];

    if (!u.activo) {
      return res.status(403).json({
        ok: false,
        error: 'Cuenta desactivada. Contactá al administrador.'
      });
    }

    req.user = u;
    next();
  } catch (err) {
    console.error('[AUTH]', err.message);
    res.status(500).json({ ok: false, error: 'Error de autenticación' });
  }
}

module.exports = { autenticar };