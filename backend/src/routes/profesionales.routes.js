'use strict';

const router = require('express').Router();
const { body, param } = require('express-validator');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { apiLimiter } = require('../middleware/rateLimiter');
const { validar } = require('../middleware/validate');
const { Profesionales, HorariosProfesional, BloqueosProfesional } = require('../models/queries');

router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

const validarProfesional = [
  body('nombre').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('telefono').optional({ checkFalsy: true }).trim(),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
];

// GET /api/profesionales
router.get('/', async (req, res) => {
  try {
    const profesionales = await Profesionales.listar(req.user.id);
    return res.json({ ok: true, profesionales });
  } catch (err) {
    console.error('[PROFESIONALES/listar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener profesionales' });
  }
});

// POST /api/profesionales
router.post('/', validarProfesional, validar, async (req, res) => {
  try {
    const { nombre, telefono, color } = req.body;
    const profesional = await Profesionales.crear(req.user.id, { nombre, telefono, color });
    return res.status(201).json({ ok: true, profesional });
  } catch (err) {
    console.error('[PROFESIONALES/crear]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear profesional' });
  }
});

// PUT /api/profesionales/:id
router.put('/:id',
  param('id').isUUID(),
  validarProfesional,
  validar,
  async (req, res) => {
    try {
      const { nombre, telefono, color } = req.body;
      const profesional = await Profesionales.actualizar(req.params.id, req.user.id, { nombre, telefono, color });
      if (!profesional) return res.status(404).json({ ok: false, error: 'Profesional no encontrado' });
      return res.json({ ok: true, profesional });
    } catch (err) {
      console.error('[PROFESIONALES/actualizar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al actualizar profesional' });
    }
  }
);

// DELETE /api/profesionales/:id
router.delete('/:id',
  param('id').isUUID(),
  validar,
  async (req, res) => {
    try {
      await Profesionales.eliminar(req.params.id, req.user.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[PROFESIONALES/eliminar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al eliminar profesional' });
    }
  }
);

// ── HORARIOS SEMANALES ──────────────────────────────────────────────────────

// GET /api/profesionales/:id/horarios
router.get('/:id/horarios',
  param('id').isUUID(), validar,
  async (req, res) => {
    try {
      // Verificar que el profesional pertenece al usuario
      const prof = await Profesionales.buscarPorId(req.params.id, req.user.id);
      if (!prof) return res.status(404).json({ ok: false, error: 'Profesional no encontrado' });
      const horarios = await HorariosProfesional.listar(req.params.id);
      return res.json({ ok: true, horarios });
    } catch (err) {
      console.error('[HORARIOS/listar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al obtener horarios' });
    }
  }
);

// PUT /api/profesionales/:id/horarios  (reemplaza todos de una)
router.put('/:id/horarios',
  param('id').isUUID(),
  body('bloques').isArray(),
  validar,
  async (req, res) => {
    try {
      const prof = await Profesionales.buscarPorId(req.params.id, req.user.id);
      if (!prof) return res.status(404).json({ ok: false, error: 'Profesional no encontrado' });
      const horarios = await HorariosProfesional.guardar(req.params.id, req.body.bloques);
      return res.json({ ok: true, horarios });
    } catch (err) {
      console.error('[HORARIOS/guardar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al guardar horarios' });
    }
  }
);

// ── BLOQUEOS DE DÍAS ────────────────────────────────────────────────────────

// GET /api/profesionales/:id/bloqueos
router.get('/:id/bloqueos',
  param('id').isUUID(), validar,
  async (req, res) => {
    try {
      const prof = await Profesionales.buscarPorId(req.params.id, req.user.id);
      if (!prof) return res.status(404).json({ ok: false, error: 'Profesional no encontrado' });
      const bloqueos = await BloqueosProfesional.listar(req.params.id);
      return res.json({ ok: true, bloqueos });
    } catch (err) {
      console.error('[BLOQUEOS/listar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al obtener bloqueos' });
    }
  }
);

// POST /api/profesionales/:id/bloqueos
router.post('/:id/bloqueos',
  param('id').isUUID(),
  body('fecha').isDate(),
  body('motivo').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
  validar,
  async (req, res) => {
    try {
      const prof = await Profesionales.buscarPorId(req.params.id, req.user.id);
      if (!prof) return res.status(404).json({ ok: false, error: 'Profesional no encontrado' });
      const bloqueo = await BloqueosProfesional.agregar(req.params.id, req.body.fecha, req.body.motivo);
      return res.status(201).json({ ok: true, bloqueo });
    } catch (err) {
      console.error('[BLOQUEOS/agregar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al agregar bloqueo' });
    }
  }
);

// DELETE /api/profesionales/:id/bloqueos/:bloqueoId
router.delete('/:id/bloqueos/:bloqueoId',
  param('id').isUUID(),
  param('bloqueoId').isUUID(),
  validar,
  async (req, res) => {
    try {
      const prof = await Profesionales.buscarPorId(req.params.id, req.user.id);
      if (!prof) return res.status(404).json({ ok: false, error: 'Profesional no encontrado' });
      await BloqueosProfesional.eliminar(req.params.bloqueoId, req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[BLOQUEOS/eliminar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al eliminar bloqueo' });
    }
  }
);

module.exports = router;
