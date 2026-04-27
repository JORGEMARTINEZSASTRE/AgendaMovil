'use strict';

const router   = require('express').Router();
const { body } = require('express-validator');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar }    = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimiter');
const { Configuracion } = require('../models/queries');

router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

// ─── Validaciones ────────────────────────────────────────────
const validarConfig = [
  body('plantilla_turno')
    .notEmpty().withMessage('La plantilla de turno es requerida')
    .isLength({ min: 10, max: 2000 }).withMessage('Plantilla entre 10 y 2000 caracteres'),
  body('plantilla_cumple')
    .notEmpty().withMessage('La plantilla de cumpleaños es requerida')
    .isLength({ min: 10, max: 2000 }).withMessage('Plantilla entre 10 y 2000 caracteres'),
];

// ─── Rutas ───────────────────────────────────────────────────

// GET /api/config
router.get('/', async (req, res) => {
  try {
    let config = await Configuracion.get(req.user.id);

    // Si no tiene config, devolver defaults
    if (!config) {
      config = {
        plantilla_turno: `¡Hola {nombre}! 🌸

Te confirmamos tu turno:

📅 *{fecha}* a las *{hora}*
✂️ Servicio: *{servicio}*
📍 Zona: *{zona}*
⏱ Duración: *{duracion} min*

¡Te esperamos! ✨`,
        plantilla_cumple: `¡Feliz cumpleaños {nombre}! 🎂🌸

Te deseamos un día muy especial. 🎉✨`,
      };
    }

    return res.json({ ok: true, config });
  } catch (err) {
    console.error('[CONFIG/get]', err.message);
    return res.status(500).json({
      ok:    false,
      error: 'Error al obtener configuración',
    });
  }
});

// PUT /api/config
router.put('/',
  validarConfig,
  validar,
  async (req, res) => {
    try {
      const { plantilla_turno, plantilla_cumple } = req.body;

      const config = await Configuracion.guardar(req.user.id, {
        plantillaTurno:  plantilla_turno,
        plantillaCumple: plantilla_cumple,
      });

      return res.json({
        ok:      true,
        mensaje: 'Configuración guardada',
        config,
      });
    } catch (err) {
      console.error('[CONFIG/guardar]', err.message);
      return res.status(500).json({
        ok:    false,
        error: 'Error al guardar configuración',
      });
    }
  }
);

module.exports = router;