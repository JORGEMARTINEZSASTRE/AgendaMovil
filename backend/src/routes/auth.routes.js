'use strict';

const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/auth.controller');
const { autenticar }   = require('../middleware/auth');
const { validar }      = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiter');

// ─── Validaciones ────────────────────────────────────────────
const validarLogin = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
];

const validarInvitacion = [
  body('token')
    .notEmpty().withMessage('Token requerido')
    .isLength({ min: 10 }).withMessage('Token inválido'),
  body('nombre')
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('Nombre entre 2 y 100 caracteres')
    .trim(),
  body('password')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
];

// ─── Rutas ───────────────────────────────────────────────────

// POST /api/auth/login
router.post('/login',
  loginLimiter,
  validarLogin,
  validar,
  ctrl.login
);

// GET /api/auth/me
router.get('/me',
  autenticar,
  ctrl.me
);

// POST /api/auth/activar-invitacion
router.post('/activar-invitacion',
  validarInvitacion,
  validar,
  ctrl.activarInvitacion
);

module.exports = router;