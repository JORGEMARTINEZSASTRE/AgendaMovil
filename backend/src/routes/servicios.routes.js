'use strict';

const router   = require('express').Router();
const { body, param } = require('express-validator');
const ctrl     = require('../controllers/servicios.controller');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar }    = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimiter');

// Todos los endpoints requieren auth + plan activo
router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

// ─── Validaciones ────────────────────────────────────────────
const validarServicio = [
  body('nombre')
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 255 }).withMessage('Nombre entre 2 y 255 caracteres')
    .trim(),

  body('categoria')
    .optional()
    .isLength({ max: 100 }).withMessage('Categoría demasiado larga')
    .trim(),

 body('zona')
  .optional()
  .isLength({ min: 2, max: 255 }).withMessage('Zona entre 2 y 255 caracteres')
  .trim(),

  body('duracion')
    .isInt({ min: 5, max: 480 }).withMessage('Duración entre 5 y 480 minutos'),

  body('precio')                                              // ← agregá esto
  .optional()
  .isFloat({ min: 0 }).withMessage('El precio debe ser un número positivo'),

  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color inválido. Formato: #RRGGBB'),

  body('descripcion')
    .optional()
    .isLength({ max: 500 }).withMessage('Descripción muy larga')
    .trim(),
];

const validarId = [
  param('id')
    .isUUID().withMessage('ID inválido'),
];

// ─── Rutas ───────────────────────────────────────────────────

// GET /api/servicios
router.get('/', ctrl.listar);

// GET /api/servicios/:id
router.get('/:id',
  validarId,
  validar,
  ctrl.obtener
);

// POST /api/servicios
router.post('/',
  validarServicio,
  validar,
  ctrl.crear
);

// PUT /api/servicios/:id
router.put('/:id',
  validarId,
  validarServicio,
  validar,
  ctrl.actualizar
);

// DELETE /api/servicios/:id
router.delete('/:id',
  validarId,
  validar,
  ctrl.eliminar
);

module.exports = router;