'use strict';

const { Sucursales } = require('../models/queries');

function normalizarHorarios(horarios) {
  if (!Array.isArray(horarios)) return [];

  return horarios
    .map(h => ({
      dia: Number(h?.dia),
      activo: Boolean(h?.activo),
      desde: String(h?.desde || ''),
      hasta: String(h?.hasta || ''),
    }))
    .filter(h =>
      Number.isInteger(h.dia) &&
      h.dia >= 0 && h.dia <= 6 &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(h.desde) &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(h.hasta) &&
      h.desde < h.hasta
    );
}

async function crear(req, res) {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    const maxTurnosHora = Number(req.body?.max_turnos_hora || 1);

    if (!nombre) {
      return res.status(422).json({ ok: false, error: 'Nombre de sucursal requerido' });
    }
    if (!Number.isInteger(maxTurnosHora) || maxTurnosHora < 1 || maxTurnosHora > 20) {
      return res.status(422).json({ ok: false, error: 'max_turnos_hora inválido (1-20)' });
    }

    const sucursal = await Sucursales.crear(req.user.id, { nombre, maxTurnosHora });
    return res.status(201).json({ ok: true, sucursal });
  } catch (err) {
    console.error('[SUCURSALES/crear]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear sucursal' });
  }
}

async function listar(req, res) {
  try {
    const sucursales = await Sucursales.listar(req.user.id);
    return res.json({ ok: true, sucursales });
  } catch (err) {
    console.error('[SUCURSALES/listar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al listar sucursales' });
  }
}

async function obtenerHorarios(req, res) {
  try {
    const sucursal = await Sucursales.obtenerHorarios(req.params.id, req.user.id);
    if (!sucursal) {
      return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
    }
    return res.json({ ok: true, sucursal });
  } catch (err) {
    console.error('[SUCURSALES/obtenerHorarios]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener horarios' });
  }
}

async function guardarHorarios(req, res) {
  try {
    const horarios = normalizarHorarios(req.body?.horarios);

    if (!Array.isArray(req.body?.horarios) || horarios.length !== req.body.horarios.length) {
      return res.status(422).json({ ok: false, error: 'Formato de horarios inválido' });
    }

    const actualizado = await Sucursales.guardarHorarios(req.params.id, req.user.id, horarios);
    if (!actualizado) {
      return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
    }

    return res.json({
      ok: true,
      mensaje: 'Horarios actualizados',
      sucursal: actualizado,
    });
  } catch (err) {
    console.error('[SUCURSALES/guardarHorarios]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al guardar horarios' });
  }
}

module.exports = {
  crear,
  listar,
  obtenerHorarios,
  guardarHorarios,
};
