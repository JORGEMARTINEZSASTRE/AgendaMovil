'use strict';

const { validationResult } = require('express-validator');

/**
 * Middleware que verifica los resultados de express-validator.
 * Si hay errores, responde 422 con detalle de cada campo.
 */
function validar(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({
      ok: false,
      error: 'Datos inválidos',
      errores: errores.array().map(e => ({
        campo: e.path,
        mensaje: e.msg,
      })),
    });
  }
  next();
}

/**
 * Validación manual para el auto-registro público.
 */
function validarRegistro(req, res, next) {
  const { nombre, email, password, codigo_pais } = req.body;
  const errores = [];

  if (!nombre || nombre.trim().length < 2)
    errores.push('El nombre debe tener al menos 2 caracteres');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errores.push('Email inválido');
  if (!password || password.length < 8)
    errores.push('La contraseña debe tener al menos 8 caracteres');
  if (codigo_pais && !['+598', '+54'].includes(codigo_pais))
    errores.push('Código de país inválido');

  if (errores.length) {
    return res.status(400).json({ error: errores.join('. ') });
  }
  next();
}

module.exports = { validar, validarRegistro };