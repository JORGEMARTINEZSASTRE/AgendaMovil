'use strict';

const router   = require('express').Router();
const { body } = require('express-validator');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar }    = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimiter');
const { Configuracion } = require('../models/queries');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const { query } = require('../config/db');
const { subirImagen, eliminarImagen } = require('../services/cloudinary');

// ── Multer: logo temporal ──────────────────────────
const storageLogo = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => cb(null, `logo_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`)
});
const uploadLogo = multer({
  storage: storageLogo,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

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

// ════════════════════════════════════════════════
// LOGO DE USUARIO
// ════════════════════════════════════════════════

router.post('/logo', uploadLogo.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió imagen' });

    const { rows } = await query(
      'SELECT logo_url FROM usuarios WHERE id = $1',
      [req.user.id]
    );

    // Eliminar logo anterior
    if (rows[0]?.logo_url) {
      await eliminarImagen(rows[0].logo_url);
    }

    // Subir a Cloudinary
    const url = await subirImagen(req.file.path, 'logos');
    fs.unlinkSync(req.file.path);

    await query('UPDATE usuarios SET logo_url = $1 WHERE id = $2', [url, req.user.id]);

    res.json({ ok: true, logo_url: url });
  } catch (e) {
    console.error('[CONFIG/logo]', e.message);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete('/logo', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT logo_url FROM usuarios WHERE id = $1',
      [req.user.id]
    );

    if (rows[0]?.logo_url) {
      await eliminarImagen(rows[0].logo_url);
    }

    await query('UPDATE usuarios SET logo_url = NULL WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[CONFIG/eliminar-logo]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});