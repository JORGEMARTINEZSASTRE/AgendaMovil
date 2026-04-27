'use strict';

const { Turnos } = require('../models/queries');

// ════════════════════════════════════════════════════════════
//  GET /api/turnos
// ════════════════════════════════════════════════════════════
async function listar(req, res) {
  try {
    const filtros = {};

    if (req.query.fecha) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)) {
        return res.status(422).json({
          ok:    false,
          error: 'Formato de fecha inválido. Usar YYYY-MM-DD',
        });
      }
      filtros.fecha = req.query.fecha;
    }

    if (req.query.mes && req.query.anio) {
      filtros.mes  = parseInt(req.query.mes);
      filtros.anio = parseInt(req.query.anio);
    }

    const turnos = await Turnos.listar(req.user.id, filtros);

    return res.json({
      ok:    true,
      turnos,
      total: turnos.length,
    });

  } catch (err) {
    console.error('[TURNOS/listar]', err.message);
    return res.status(500).json({
      ok:    false,
      error: 'Error al obtener turnos',
    });
  }
}

// ════════════════════════════════════════════════════════════
//  GET /api/turnos/cumples
// ════════════════════════════════════════════════════════════
async function getCumples(req, res) {
  try {
    const cumples = await Turnos.getCumples(req.user.id);
    return res.json({ ok: true, cumples });
  } catch (err) {
    console.error('[TURNOS/cumples]', err.message);
    return res.status(500).json({
      ok:    false,
      error: 'Error al obtener cumpleaños',
    });
  }
}

// ════════════════════════════════════════════════════════════
//  GET /api/turnos/:id
// ════════════════════════════════════════════════════════════
async function obtener(req, res) {
  try {
    const turno = await Turnos.buscarPorId(req.params.id, req.user.id);

    if (!turno) {
      return res.status(404).json({
        ok:    false,
        error: 'Turno no encontrado',
      });
    }

    return res.json({ ok: true, turno });

  } catch (err) {
    console.error('[TURNOS/obtener]', err.message);
    return res.status(500).json({
      ok:    false,
      error: 'Error al obtener el turno',
    });
  }
}

// ════════════════════════════════════════════════════════════
//  POST /api/turnos
// ════════════════════════════════════════════════════════════
async function crear(req, res) {
  try {
    const {
      servicio_id,    nombre,         telefono,
      servicio_nombre, servicio_zona, servicio_color,
      duracion,       fecha,          hora,
      notas,          cumple_dia,     cumple_mes,
    } = req.body;

    // Verificar conflicto de horarios
    const conflictos = await Turnos.verificarConflicto(
      req.user.id, fecha, hora, duracion
    );

    if (conflictos.length > 0) {
      return res.status(409).json({
        ok:        false,
        error:     `Conflicto de horario con el turno de ${conflictos[0].nombre}`,
        conflicto: conflictos[0],
      });
    }

    const turno = await Turnos.crear(req.user.id, {
      servicioId:     servicio_id,
      nombre,
      telefono,
      servicioNombre: servicio_nombre,
      servicioZona:   servicio_zona,
      servicioColor:  servicio_color,
      duracion,
      fecha,
      hora,
      notas,
      cumpleDia:      cumple_dia,
      cumpleMes:      cumple_mes,
    });

    return res.status(201).json({
      ok:      true,
      mensaje: 'Turno creado exitosamente',
      turno,
    });

  } catch (err) {
    console.error('[TURNOS/crear]', err.message);
    return res.status(500).json({
      ok:    false,
      error: 'Error al crear el turno',
    });
  }
}

// ════════════════════════════════════════════════════════════
//  PUT /api/turnos/:id
// ════════════════════════════════════════════════════════════
async function actualizar(req, res) {
  try {
    const {
      servicio_id,     nombre,        telefono,
      servicio_nombre, servicio_zona, servicio_color,
      duracion,        fecha,         hora,
      notas,           cumple_dia,    cumple_mes,
      estado,
    } = req.body;

    // Verificar que existe y pertenece al usuario
    const existente = await Turnos.buscarPorId(req.params.id, req.user.id);
    if (!existente) {
      return res.status(404).json({
        ok:    false,
        error: 'Turno no encontrado',
      });
    }

    // Verificar conflicto excluyendo el turno actual
    const conflictos = await Turnos.verificarConflicto(
      req.user.id, fecha, hora, duracion, req.params.id
    );

    if (conflictos.length > 0) {
      return res.status(409).json({
        ok:        false,
        error:     `Conflicto de horario con el turno de ${conflictos[0].nombre}`,
        conflicto: conflictos[0],
      });
    }

    const turno = await Turnos.actualizar(req.params.id, req.user.id, {
      servicioId:     servicio_id,
      nombre,
      telefono,
      servicioNombre: servicio_nombre,
      servicioZona:   servicio_zona,
      servicioColor:  servicio_color,
      duracion,
      fecha,
      hora,
      notas,
      cumpleDia:      cumple_dia,
      cumpleMes:      cumple_mes,
      estado,
    });

    return res.json({
      ok:      true,
      mensaje: 'Turno actualizado exitosamente',
      turno,
    });

  } catch (err) {
    console.error('[TURNOS/actualizar]', err.message);
    return res.status(500).json({
      ok:    false,
      error: 'Error al actualizar el turno',
    });
  }
}

// ════════════════════════════════════════════════════════════
//  DELETE /api/turnos/:id
// ════════════════════════════════════════════════════════════
async function eliminar(req, res) {
  try {
    const eliminado = await Turnos.eliminar(req.params.id, req.user.id);

    if (!eliminado) {
      return res.status(404).json({
        ok:    false,
        error: 'Turno no encontrado',
      });
    }

    return res.json({
      ok:      true,
      mensaje: 'Turno eliminado exitosamente',
    });

  } catch (err) {
    console.error('[TURNOS/eliminar]', err.message);
    return res.status(500).json({
      ok:    false,
      error: 'Error al eliminar el turno',
    });
  }
}

module.exports = { listar, getCumples, obtener, crear, actualizar, eliminar };