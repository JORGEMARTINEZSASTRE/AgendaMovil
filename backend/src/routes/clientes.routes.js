'use strict';

const router = require('express').Router();
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { apiLimiter } = require('../middleware/rateLimiter');
const { Clientes, ClientesManual } = require('../models/queries');
const { normalizarTelefono } = require('../utils/telefono');

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

// GET /api/clientes/resumen — resumen financiero: semana, mes, top servicios, clienta del mes
router.get('/resumen', async (req, res) => {
  try {
    const resumen = await Clientes.resumen(req.user.id);
    return res.json({ ok: true, resumen });
  } catch (err) {
    console.error('[CLIENTES/resumen]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener resumen' });
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

// ─── LIMPIEZA DE CLIENTES INACTIVOS ─────────────────────────────────

// GET /api/clientes/inactivos?meses=6 — vista previa, no borra nada
router.get('/inactivos', async (req, res) => {
  try {
    const meses = Math.min(Math.max(parseInt(req.query.meses) || 6, 1), 120);
    const clientes = await Clientes.inactivos(req.user.id, meses);

    const totales = clientes.reduce((acc, c) => ({
      clientes: acc.clientes + 1,
      turnos:   acc.turnos + Number(c.total_turnos || 0),
      gastado:  acc.gastado + Number(c.total_gastado || 0),
    }), { clientes: 0, turnos: 0, gastado: 0 });

    return res.json({ ok: true, meses, clientes, totales });
  } catch (err) {
    console.error('[CLIENTES/inactivos]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al buscar clientes inactivos' });
  }
});

// POST /api/clientes/eliminar — borra clientas y TODOS sus turnos.
// Destructivo y sin vuelta atrás: por eso exige la lista explícita de
// teléfonos que la operadora confirmó, no un criterio del tipo "todo lo viejo".
router.post('/eliminar', async (req, res) => {
  try {
    const { telefonos } = req.body;

    if (!Array.isArray(telefonos) || !telefonos.length) {
      return res.status(400).json({ ok: false, error: 'Hay que indicar qué clientas borrar' });
    }
    if (telefonos.length > 500) {
      return res.status(400).json({ ok: false, error: 'Demasiadas de una vez. Hacelo en tandas de hasta 500.' });
    }
    if (!telefonos.every(t => typeof t === 'string' && t.trim())) {
      return res.status(400).json({ ok: false, error: 'Lista de teléfonos inválida' });
    }

    const borrado = await Clientes.eliminarPorTelefonos(req.user.id, telefonos);

    console.log(`[CLIENTES/eliminar] user=${req.user.id} clientes=${borrado.clientes} turnos=${borrado.turnos}`);

    return res.json({
      ok: true,
      ...borrado,
      mensaje: `Se borraron ${telefonos.length} clienta(s) y ${borrado.turnos} turno(s).`,
    });
  } catch (err) {
    console.error('[CLIENTES/eliminar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al borrar las clientas' });
  }
});

// ─── CLIENTES MANUALES ──────────────────────────────────────────────
// GET /api/clientes/manual — lista
router.get('/manual', async (req, res) => {
  try {
    const clientes = await ClientesManual.listar(req.user.id);
    return res.json({ ok: true, clientes });
  } catch (err) {
    console.error('[CLIENTES-MANUAL/listar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener clientes' });
  }
});

// POST /api/clientes/manual — crear
router.post('/manual', async (req, res) => {
  try {
    let { nombre, telefono } = req.body;
    if (!nombre || !telefono) {
      return res.status(400).json({ ok: false, error: 'Nombre y teléfono requeridos' });
    }
    // Normalizar a formato internacional
    telefono = normalizarTelefono(telefono);
    const cliente = await ClientesManual.crear(req.user.id, { nombre, telefono });
    return res.json({ ok: true, cliente });
  } catch (err) {
    console.error('[CLIENTES-MANUAL/crear]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear cliente' });
  }
});

// PATCH /api/clientes/manual/:id/favorito — toggle estrella
router.patch('/manual/:id/favorito', async (req, res) => {
  try {
    const cliente = await ClientesManual.toggleFavorito(req.params.id, req.user.id);
    if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    return res.json({ ok: true, cliente });
  } catch (err) {
    console.error('[CLIENTES-MANUAL/favorito]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al actualizar favorito' });
  }
});

// DELETE /api/clientes/manual/:id — eliminar
router.delete('/manual/:id', async (req, res) => {
  try {
    await ClientesManual.eliminar(req.params.id, req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[CLIENTES-MANUAL/eliminar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar cliente' });
  }
});

module.exports = router;
