'use strict';

const router = require('express').Router();
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { apiLimiter } = require('../middleware/rateLimiter');
const { Clientes } = require('../models/queries');

router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

// GET /api/clientes — lista de clientes con gasto acumulado
router.get('/', async (req, res) => {
  try {
    const clientes = await Clientes.listar(req.user.id);
    return res.json({ ok: true, clientes });
  } catch (err) {
    console.error('[CLIENTES/listar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener clientes' });
  }
});

// GET /api/clientes/:telefono/historial — historial de turnos de un cliente
router.get('/:telefono/historial', async (req, res) => {
  try {
    const historial = await Clientes.historial(req.user.id, req.params.telefono);
    return res.json({ ok: true, historial });
  } catch (err) {
    console.error('[CLIENTES/historial]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener historial' });
  }
});

module.exports = router;
