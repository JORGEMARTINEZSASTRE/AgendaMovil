'use strict';

const express = require('express');
const router = express.Router();
const { WaPendientes } = require('../models/queries');
const { autenticar } = require('../middleware/auth');

// Todas las rutas requieren estar logueado
router.use(autenticar);

// GET /api/wa/pendientes
router.get('/pendientes', async (req, res) => {
  try {
    const soloPendientes = req.query.soloPendientes !== 'false';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const [lista, pendientes] = await Promise.all([
      WaPendientes.listar(req.user.id, { soloPendientes, limit }),
      WaPendientes.contarPendientes(req.user.id),
    ]);

    res.json({ ok: true, mensajes: lista, pendientes });
  } catch (err) {
    console.error('[wa/listar]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /api/wa/:id/enviado
router.post('/:id/enviado', async (req, res) => {
  try {
    await WaPendientes.marcarEnviado(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[wa/enviado]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /api/wa/:id
router.delete('/:id', async (req, res) => {
  try {
    await WaPendientes.eliminar(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[wa/eliminar]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;