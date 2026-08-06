'use strict';

const router   = require('express').Router();
const { body, param } = require('express-validator');
const ctrl     = require('../controllers/servicios.controller');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar }    = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimiter');
const multer   = require('multer');
const os       = require('os');
const path     = require('path');
const fs       = require('fs');
const { Servicios, ServicioFotos } = require('../models/queries');
const { subirImagen, eliminarImagen } = require('../services/cloudinary');

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
  .optional({ nullable: true, checkFalsy: true })
  .isLength({ max: 255 }).withMessage('Zona demasiado larga')
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

  body('senia_tipo')
    .optional()
    .isIn(['monto', 'porcentaje']).withMessage('Tipo de seña inválido'),

  body('senia_porcentaje')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 1, max: 100 }).withMessage('El porcentaje de seña debe estar entre 1 y 100'),
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

// ═══════════════════════════════════════════════════════════
//  FOTOS DEL SERVICIO (vitrina)
// ═══════════════════════════════════════════════════════════

const uploadFotos = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) =>
      cb(null, `serv_${req.user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: ServicioFotos.MAX },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

/** Borra los temporales que dejó multer, pase lo que pase. */
function limpiarTemporales(files) {
  for (const f of files || []) {
    try { if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch { /* ya no está */ }
  }
}

// GET /api/servicios/:id/fotos
router.get('/:id/fotos', validarId, validar, async (req, res) => {
  try {
    const servicio = await Servicios.buscarPorId(req.params.id, req.user.id);
    if (!servicio) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });

    const fotos = await ServicioFotos.listar(req.params.id);
    return res.json({ ok: true, fotos, max: ServicioFotos.MAX });
  } catch (err) {
    console.error('[SERVICIOS/fotos-listar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener las fotos' });
  }
});

// POST /api/servicios/:id/fotos
router.post('/:id/fotos', validarId, validar, uploadFotos.array('fotos', ServicioFotos.MAX), async (req, res) => {
  try {
    const servicio = await Servicios.buscarPorId(req.params.id, req.user.id);
    if (!servicio) {
      limpiarTemporales(req.files);
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }

    if (!req.files?.length) {
      return res.status(400).json({ ok: false, error: 'No se recibió ninguna imagen' });
    }

    // No pasarse del máximo contando las que ya tiene
    const yaTiene = await ServicioFotos.contar(req.params.id);
    const lugar   = ServicioFotos.MAX - yaTiene;
    if (lugar <= 0) {
      limpiarTemporales(req.files);
      return res.status(409).json({
        ok: false,
        error: `Este servicio ya tiene el máximo de ${ServicioFotos.MAX} fotos. Borrá alguna para subir otra.`,
      });
    }

    const aSubir  = req.files.slice(0, lugar);
    const sobran  = req.files.slice(lugar);
    limpiarTemporales(sobran);

    const fotos = [];
    for (const file of aSubir) {
      const url = await subirImagen(file.path, 'servicios');
      fotos.push(await ServicioFotos.agregar(req.params.id, url));
    }
    limpiarTemporales(aSubir);

    const portada = await ServicioFotos.sincronizarPortada(req.params.id);

    return res.status(201).json({
      ok: true,
      fotos,
      portada,
      ignoradas: sobran.length,
      mensaje: sobran.length
        ? `Se subieron ${fotos.length}. Las otras ${sobran.length} no entraron: el máximo es ${ServicioFotos.MAX}.`
        : undefined,
    });
  } catch (err) {
    console.error('[SERVICIOS/fotos-subir]', err.message);
    limpiarTemporales(req.files);
    return res.status(500).json({ ok: false, error: 'Error al subir las fotos' });
  }
});

// DELETE /api/servicios/:id/fotos/:fotoId
router.delete('/:id/fotos/:fotoId',
  validarId,
  param('fotoId').isUUID().withMessage('ID de foto inválido'),
  validar,
  async (req, res) => {
    try {
      const servicio = await Servicios.buscarPorId(req.params.id, req.user.id);
      if (!servicio) return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });

      const url = await ServicioFotos.eliminar(req.params.fotoId, req.params.id);
      if (!url) return res.status(404).json({ ok: false, error: 'Foto no encontrada' });

      await eliminarImagen(url);
      const portada = await ServicioFotos.sincronizarPortada(req.params.id);

      return res.json({ ok: true, portada });
    } catch (err) {
      console.error('[SERVICIOS/fotos-eliminar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al eliminar la foto' });
    }
  }
);

module.exports = router;