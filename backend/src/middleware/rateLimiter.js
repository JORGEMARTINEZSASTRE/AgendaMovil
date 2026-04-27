'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter para login.
 * Máximo 10 intentos por IP cada 15 minutos.
 */
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutos
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  skipSuccessfulRequests: true, // Solo cuenta los fallidos
  message: {
    ok:    false,
    error: 'Demasiados intentos de login. Esperá 15 minutos.'
  },
  keyGenerator: (req) => {
    // Combinar IP + email para mayor precisión
    const email = req.body?.email || 'unknown';
    return `${req.ip}_${email.toLowerCase()}`;
  },
});

/**
 * Rate limiter general para la API.
 * Máximo 200 requests por IP cada 15 minutos.
 */
const apiLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    ok:    false,
    error: 'Demasiadas solicitudes. Esperá un momento.'
  },
});

/**
 * Rate limiter estricto para endpoints sensibles.
 * Máximo 20 requests por IP cada hora.
 */
const estrictoLimiter = rateLimit({
  windowMs:        60 * 60 * 1000, // 1 hora
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    ok:    false,
    error: 'Límite de solicitudes alcanzado. Intentá en 1 hora.'
  },
});

const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,                    // 3 registros por IP por hora
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados registros desde esta IP. Probá más tarde.' }
});
module.exports = { loginLimiter, apiLimiter, estrictoLimiter,registroLimiter  };