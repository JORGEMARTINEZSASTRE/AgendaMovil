'use strict';

const router = require('express').Router();
const { body, param, query: q } = require('express-validator');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar }    = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimiter');
const { Caja }       = require('../models/queries');

router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Si no mandan rango, el mes corriente. Es lo que la operadora mira el 90%
// de las veces y evita que la app tenga que calcularlo en el navegador.
function rango(req) {
  const hoy   = new Date();
  const desde = req.query.desde && FECHA.test(req.query.desde)
    ? req.query.desde
    : new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const hasta = req.query.hasta && FECHA.test(req.query.hasta)
    ? req.query.hasta
    : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { desde, hasta };
}

// GET /api/caja/resumen?desde=&hasta=
router.get('/resumen', async (req, res) => {
  try {
    const { desde, hasta } = rango(req);
    const resumen = await Caja.resumen(req.user.id, { desde, hasta });
    return res.json({ ok: true, desde, hasta, ...resumen });
  } catch (err) {
    console.error('[CAJA/resumen]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener el resumen' });
  }
});

// GET /api/caja/movimientos?desde=&hasta=&tipo=
router.get('/movimientos',
  q('tipo').optional().isIn(['ingreso', 'gasto']),
  validar,
  async (req, res) => {
    try {
      const { desde, hasta } = rango(req);
      const movimientos = await Caja.listar(req.user.id, {
        desde, hasta, tipo: req.query.tipo || null,
      });
      return res.json({
        ok: true, desde, hasta, movimientos,
        categorias: { ingreso: Caja.CATEGORIAS_INGRESO, gasto: Caja.CATEGORIAS_GASTO },
        medios: Caja.MEDIOS_PAGO,
      });
    } catch (err) {
      console.error('[CAJA/movimientos]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al obtener los movimientos' });
    }
  }
);

// POST /api/caja/movimientos — carga manual (un gasto, la venta de un producto)
router.post('/movimientos',
  [
    body('tipo').isIn(['ingreso', 'gasto']).withMessage('Tipo inválido'),
    body('categoria').notEmpty().isLength({ max: 60 }).trim().withMessage('Categoría inválida'),
    body('monto').isFloat({ gt: 0 }).withMessage('El monto tiene que ser mayor a cero'),
    body('medio_pago').optional().isIn(Caja.MEDIOS_PAGO).withMessage('Medio de pago inválido'),
    body('fecha').optional({ nullable: true, checkFalsy: true })
      .matches(FECHA).withMessage('Fecha inválida'),
    body('concepto').optional({ nullable: true }).isLength({ max: 200 }).trim(),
  ],
  validar,
  async (req, res) => {
    try {
      const { tipo, categoria } = req.body;

      const validas = tipo === 'ingreso' ? Caja.CATEGORIAS_INGRESO : Caja.CATEGORIAS_GASTO;
      if (!validas.includes(categoria)) {
        return res.status(400).json({
          ok: false,
          error: `Categoría inválida para un ${tipo}. Válidas: ${validas.join(', ')}`,
        });
      }

      const movimiento = await Caja.crear(req.user.id, {
        tipo,
        categoria,
        concepto:  req.body.concepto || null,
        monto:     parseFloat(req.body.monto),
        medioPago: req.body.medio_pago || 'efectivo',
        fecha:     req.body.fecha || null,
      });

      return res.status(201).json({ ok: true, mensaje: 'Movimiento registrado', movimiento });
    } catch (err) {
      console.error('[CAJA/crear]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al registrar el movimiento' });
    }
  }
);

// DELETE /api/caja/movimientos/:id
router.delete('/movimientos/:id',
  [param('id').isUUID().withMessage('ID inválido')],
  validar,
  async (req, res) => {
    try {
      const borrado = await Caja.eliminar(req.params.id, req.user.id);
      if (!borrado) return res.status(404).json({ ok: false, error: 'Movimiento no encontrado' });
      return res.json({ ok: true, mensaje: 'Movimiento borrado' });
    } catch (err) {
      console.error('[CAJA/borrar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al borrar el movimiento' });
    }
  }
);

// GET /api/caja/turnos/:id/sugerencia — cuánto falta cobrar de este turno
router.get('/turnos/:id/sugerencia',
  [param('id').isUUID().withMessage('ID inválido')],
  validar,
  async (req, res) => {
    try {
      const s = await Caja.sugerirCobro(req.user.id, req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: 'Turno no encontrado' });
      return res.json({ ok: true, ...s, medios: Caja.MEDIOS_PAGO });
    } catch (err) {
      console.error('[CAJA/sugerencia]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al calcular el cobro' });
    }
  }
);

// POST /api/caja/turnos/:id/cobrar
router.post('/turnos/:id/cobrar',
  [
    param('id').isUUID().withMessage('ID inválido'),
    // Se permite 0: es el caso de la clienta que viene con cuponera, que
    // ya pagó el día que la compró.
    body('monto').isFloat({ min: 0 }).withMessage('El monto no puede ser negativo'),
    body('medio_pago').optional().isIn(Caja.MEDIOS_PAGO).withMessage('Medio de pago inválido'),
    body('fecha').optional({ nullable: true, checkFalsy: true })
      .matches(FECHA).withMessage('Fecha inválida'),
  ],
  validar,
  async (req, res) => {
    try {
      const r = await Caja.cobrarTurno(req.user.id, req.params.id, {
        monto:     parseFloat(req.body.monto),
        medioPago: req.body.medio_pago || 'efectivo',
        fecha:     req.body.fecha || null,
      });

      if (r.error === 'no_encontrado') {
        return res.status(404).json({ ok: false, error: 'Turno no encontrado' });
      }
      if (r.error === 'cancelado') {
        return res.status(409).json({ ok: false, error: 'Ese turno está cancelado' });
      }
      if (r.error === 'ya_cobrado') {
        return res.status(409).json({ ok: false, error: 'Este turno ya fue cobrado' });
      }

      console.log(`[CAJA/cobrar] user=${req.user.id} turno=${req.params.id} monto=${req.body.monto}`);
      return res.json({ ok: true, mensaje: 'Cobro registrado', movimiento: r.movimiento });
    } catch (err) {
      console.error('[CAJA/cobrar]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al registrar el cobro' });
    }
  }
);

// GET /api/caja/deudas — lo que le quedó por cobrar
router.get('/deudas', async (req, res) => {
  try {
    const r = await Caja.deudas(req.user.id);
    return res.json({ ok: true, ...r });
  } catch (err) {
    console.error('[CAJA/deudas]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener las deudas' });
  }
});

// GET /api/caja/avisos — configuración del recordatorio de pago
router.get('/avisos', async (req, res) => {
  try {
    const avisos = await Caja.getAvisos(req.user.id);
    return res.json({ ok: true, ...avisos });
  } catch (err) {
    console.error('[CAJA/avisos]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener la configuración' });
  }
});

// PUT /api/caja/avisos
router.put('/avisos',
  [
    body('activo').isBoolean().withMessage('Valor inválido'),
    body('dias').isInt({ min: 1, max: 30 })
      .withMessage('Los días van entre 1 y 30'),
    body('repetir').isInt({ min: 0, max: 30 })
      .withMessage('La repetición va entre 0 y 30 días'),
  ],
  validar,
  async (req, res) => {
    try {
      const avisos = await Caja.guardarAvisos(req.user.id, {
        activo:  req.body.activo === true || req.body.activo === 'true',
        dias:    parseInt(req.body.dias),
        repetir: parseInt(req.body.repetir),
      });
      return res.json({
        ok: true,
        mensaje: avisos.activo
          ? 'Listo, les voy a recordar solo'
          : 'Recordatorio de pago apagado',
        ...avisos,
      });
    } catch (err) {
      console.error('[CAJA/guardar-avisos]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al guardar' });
    }
  }
);

// ─── SOCIOS ───────────────────────────────────────────────────────────
// Si no hay socios cargados, la app no muestra nada de esto.

// GET /api/caja/socios
router.get('/socios', async (req, res) => {
  try {
    const socios = await Caja.listarSocios(req.user.id);
    return res.json({ ok: true, socios, activo: socios.some(s => s.activo) });
  } catch (err) {
    console.error('[CAJA/socios]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener los socios' });
  }
});

// PUT /api/caja/socios — se guarda la lista entera de una
router.put('/socios',
  [
    body('socios').isArray({ max: 10 }).withMessage('Máximo 10 socios'),
    body('socios.*.nombre').notEmpty().isLength({ max: 100 }).trim()
      .withMessage('Cada socio necesita un nombre'),
    body('socios.*.porcentaje').isFloat({ gt: 0, max: 100 })
      .withMessage('El porcentaje va entre 0 y 100'),
  ],
  validar,
  async (req, res) => {
    try {
      const socios = req.body.socios || [];

      if (socios.length) {
        const suma = socios.reduce((a, s) => a + parseFloat(s.porcentaje), 0);
        // Tolerancia de un centésimo: 33,33 + 33,33 + 33,34 tiene que pasar.
        if (Math.abs(suma - 100) > 0.01) {
          return res.status(400).json({
            ok: false,
            error: `Los porcentajes tienen que sumar 100. Ahora suman ${suma.toFixed(2)}.`,
          });
        }
      }

      const guardados = await Caja.guardarSocios(req.user.id, socios);
      return res.json({
        ok: true,
        mensaje: socios.length ? 'Socios guardados' : 'Reparto entre socios desactivado',
        socios: guardados,
      });
    } catch (err) {
      console.error('[CAJA/guardar-socios]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al guardar los socios' });
    }
  }
);

module.exports = router;
