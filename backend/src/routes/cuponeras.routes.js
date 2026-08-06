'use strict';

const router = require('express').Router();
const { body, param, query: q } = require('express-validator');
const { autenticar }  = require('../middleware/auth');
const { planActivo }  = require('../middleware/planGuard');
const { validar }     = require('../middleware/validate');
const { apiLimiter }  = require('../middleware/rateLimiter');
const { Cuponeras }   = require('../models/queries');
const { normalizarTelefono } = require('../utils/telefono');

router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

const validarId = [param('id').isUUID().withMessage('ID inválido')];

// GET /api/cuponeras?cerradas=1
router.get('/',
  q('cerradas').optional().isBoolean(),
  async (req, res) => {
    try {
      const cuponeras = await Cuponeras.listar(req.user.id, {
        incluirCerradas: req.query.cerradas === '1' || req.query.cerradas === 'true',
      });
      return res.json({ ok: true, cuponeras, max: Cuponeras.MAX });
    } catch (err) {
      console.error('[CUPONERAS/listar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al obtener las cuponeras' });
    }
  }
);

// POST /api/cuponeras
router.post('/',
  [
    body('cliente_nombre')
      .notEmpty().withMessage('El nombre de la clienta es requerido')
      .isLength({ min: 2, max: 255 }).withMessage('Nombre entre 2 y 255 caracteres')
      .trim(),
    body('cliente_telefono')
      .notEmpty().withMessage('El teléfono es requerido')
      .isLength({ min: 6, max: 50 }).withMessage('Teléfono inválido')
      .trim(),
    body('total_sesiones')
      .isInt({ min: 1, max: Cuponeras.MAX })
      .withMessage(`Las sesiones deben ser entre 1 y ${Cuponeras.MAX}`),
    body('precio_total')
      .optional({ nullable: true, checkFalsy: true })
      .isFloat({ min: 0 }).withMessage('El precio debe ser un número positivo'),
    body('servicio_id')
      .optional({ nullable: true, checkFalsy: true })
      .isUUID().withMessage('Servicio inválido'),
    body('notas')
      .optional({ nullable: true })
      .isLength({ max: 500 }).withMessage('Las notas son muy largas')
      .trim(),
  ],
  validar,
  async (req, res) => {
    try {
      const {
        cliente_nombre, cliente_telefono, servicio_id,
        servicio_nombre, total_sesiones, precio_total, notas,
      } = req.body;

      const cuponera = await Cuponeras.crear(req.user.id, {
        clienteNombre:   cliente_nombre,
        clienteTelefono: normalizarTelefono(cliente_telefono),
        servicioId:      servicio_id || null,
        servicioNombre:  servicio_nombre || null,
        totalSesiones:   parseInt(total_sesiones),
        precioTotal:     parseFloat(precio_total) || 0,
        notas:           notas || null,
      });

      return res.status(201).json({ ok: true, mensaje: 'Cuponera creada', cuponera });
    } catch (err) {
      console.error('[CUPONERAS/crear]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al crear la cuponera' });
    }
  }
);

// GET /api/cuponeras/:id/usos — historial de sesiones consumidas
router.get('/:id/usos', validarId, validar, async (req, res) => {
  try {
    const cuponera = await Cuponeras.buscarPorId(req.params.id, req.user.id);
    if (!cuponera) return res.status(404).json({ ok: false, error: 'Cuponera no encontrada' });

    const usos = await Cuponeras.usos(req.params.id);
    return res.json({ ok: true, cuponera, usos });
  } catch (err) {
    console.error('[CUPONERAS/usos]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener el historial' });
  }
});

// POST /api/cuponeras/:id/usar — registrar una sesión
router.post('/:id/usar',
  validarId,
  [
    body('fecha').optional({ nullable: true, checkFalsy: true })
      .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Fecha inválida'),
    body('nota').optional({ nullable: true })
      .isLength({ max: 300 }).withMessage('La nota es muy larga').trim(),
  ],
  validar,
  async (req, res) => {
    try {
      const r = await Cuponeras.registrarUso(req.params.id, req.user.id, {
        fecha:   req.body.fecha || null,
        nota:    req.body.nota || null,
        turnoId: req.body.turno_id || null,
      });

      if (r.error === 'no_encontrada') {
        return res.status(404).json({ ok: false, error: 'Cuponera no encontrada' });
      }
      if (r.error === 'cerrada') {
        return res.status(409).json({ ok: false, error: 'Esta cuponera ya está cerrada' });
      }
      if (r.error === 'sin_sesiones') {
        return res.status(409).json({ ok: false, error: 'Esta cuponera ya no tiene sesiones disponibles' });
      }

      const cuponera = await Cuponeras.buscarPorId(req.params.id, req.user.id);
      return res.json({
        ok: true,
        mensaje: cuponera.restantes > 0
          ? `Sesión registrada. Quedan ${cuponera.restantes}.`
          : 'Sesión registrada. La cuponera quedó completa.',
        cuponera,
        uso: r.uso,
      });
    } catch (err) {
      console.error('[CUPONERAS/usar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al registrar la sesión' });
    }
  }
);

// DELETE /api/cuponeras/:id/usos/:usoId — deshacer una sesión mal cargada
router.delete('/:id/usos/:usoId',
  validarId,
  [param('usoId').isUUID().withMessage('ID de sesión inválido')],
  validar,
  async (req, res) => {
    try {
      const borrado = await Cuponeras.borrarUso(req.params.usoId, req.params.id, req.user.id);
      if (!borrado) return res.status(404).json({ ok: false, error: 'Sesión no encontrada' });

      const cuponera = await Cuponeras.buscarPorId(req.params.id, req.user.id);
      return res.json({ ok: true, mensaje: 'Sesión deshecha', cuponera });
    } catch (err) {
      console.error('[CUPONERAS/borrar-uso]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al deshacer la sesión' });
    }
  }
);

// POST /api/cuponeras/:id/cerrar — cerrar antes de terminarla
router.post('/:id/cerrar', validarId, validar, async (req, res) => {
  try {
    const cuponera = await Cuponeras.cerrar(req.params.id, req.user.id);
    if (!cuponera) return res.status(404).json({ ok: false, error: 'Cuponera no encontrada' });
    return res.json({ ok: true, mensaje: 'Cuponera cerrada', cuponera });
  } catch (err) {
    console.error('[CUPONERAS/cerrar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al cerrar la cuponera' });
  }
});

module.exports = router;
