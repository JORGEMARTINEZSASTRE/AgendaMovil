'use strict';

const { Turnos, Sucursales } = require('../models/queries');
const { 
  enviarConfirmacionTurno,
  enviarModificacionTurno,
  enviarCancelacionTurno,
} = require('../../recordatorios');

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
function toMin(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return (h * 60) + m;
}

function diaSemanaNumero(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`);
  return d.getDay();
}

function estaDentroHorario(horarios, fecha, hora, duracion) {
  if (!Array.isArray(horarios) || horarios.length === 0) return true;

  const dia = diaSemanaNumero(fecha);
  const bloque = horarios.find(h => Number(h.dia) === dia && h.activo);

  if (!bloque) return false;

  const inicioTurno  = toMin(hora);
  const finTurno     = inicioTurno + Number(duracion || 0);
  const inicioBloque = toMin(bloque.desde);
  const finBloque    = toMin(bloque.hasta);

  return inicioTurno >= inicioBloque && finTurno <= finBloque;
}

async function crear(req, res) {
  try {
    const {
      servicio_id,     nombre,        telefono,
      servicio_nombre, servicio_zona, servicio_color,
      duracion,        fecha,         hora,
      notas,           cumple_dia,    cumple_mes,
      sucursal_id,
    } = req.body;

    let sucursalNombre = null;

    if (sucursal_id) {
      const sucursal = await Sucursales.obtenerHorarios(sucursal_id, req.user.id);
      if (!sucursal) {
        return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
      }

      sucursalNombre = sucursal.nombre || null;

      const disponible = estaDentroHorario(sucursal.horarios, fecha, hora, duracion);
      if (!disponible) {
        return res.status(409).json({
          ok: false,
          error: 'El horario está fuera de la disponibilidad configurada para la sucursal',
        });
      }
    }

    const conflictos = sucursal_id
      ? await Turnos.verificarConflictoPorSucursal(req.user.id, sucursal_id, fecha, hora, duracion)
      : await Turnos.verificarConflicto(req.user.id, fecha, hora, duracion);

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
      sucursalId:     sucursal_id || null,
    });

    enviarConfirmacionTurno({
      id:              turno.id,
      user_id:         req.user.id,
      nombre:          turno.nombre,
      telefono:        turno.telefono,
      fecha:           turno.fecha,
      hora:            turno.hora,
      servicio_nombre: turno.servicio_nombre,
      servicio_zona:   turno.servicio_zona,
      duracion:        turno.duracion,
      sucursal_nombre: sucursalNombre,
    }).catch(err => {
      console.error('[TURNOS/crear] Error al enviar confirmación:', err.message);
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
      estado,          sucursal_id,
    } = req.body;

    const existente = await Turnos.buscarPorId(req.params.id, req.user.id);
    if (!existente) {
      return res.status(404).json({ ok: false, error: 'Turno no encontrado' });
    }

    const sucursalObjetivo = sucursal_id ?? existente.sucursal_id ?? null;

    const fechaFinal    = fecha    ?? existente.fecha;
    const horaFinal     = hora     ?? existente.hora;
    const duracionFinal = duracion ?? existente.duracion;

    const cambioHorario =
      String(fechaFinal).slice(0, 10) !== String(existente.fecha).slice(0, 10) ||
      String(horaFinal).slice(0, 5)   !== String(existente.hora).slice(0, 5)   ||
      String(duracionFinal)            !== String(existente.duracion)           ||
      (sucursal_id !== undefined && sucursal_id !== existente.sucursal_id);

    if (cambioHorario) {
      if (sucursalObjetivo) {
        const sucursal = await Sucursales.obtenerHorarios(sucursalObjetivo, req.user.id);
        if (!sucursal) {
          return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
        }

        const disponible = estaDentroHorario(sucursal.horarios, fechaFinal, horaFinal, duracionFinal);
        if (!disponible) {
          return res.status(409).json({
            ok: false,
            error: 'El horario está fuera de la disponibilidad configurada para la sucursal',
          });
        }
      }

      const conflictos = sucursalObjetivo
        ? await Turnos.verificarConflictoPorSucursal(
            req.user.id, sucursalObjetivo, fechaFinal, horaFinal, duracionFinal, req.params.id
          )
        : await Turnos.verificarConflicto(
            req.user.id, fechaFinal, horaFinal, duracionFinal, req.params.id
          );

      if (conflictos.length > 0) {
        return res.status(409).json({
          ok:        false,
          error:     `Conflicto de horario con el turno de ${conflictos[0].nombre}`,
          conflicto: conflictos[0],
        });
      }
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
      sucursalId:     sucursalObjetivo,
    });

    const fechaAnterior = String(existente.fecha).slice(0, 10);
    const fechaNueva    = String(fecha).slice(0, 10);
    const horaAnterior  = String(existente.hora).slice(0, 5);
    const horaNueva     = String(hora).slice(0, 5);

    const fechaCambio  = fechaAnterior !== fechaNueva;
    const horaCambio   = horaAnterior  !== horaNueva;
    const cambioEstado = existente.estado !== estado;

    // Buscar nombre de sucursal para el mensaje
    let sucursalNombre = null;
    if (sucursalObjetivo) {
      const sucursalData = await Sucursales.obtenerHorarios(sucursalObjetivo, req.user.id);
      sucursalNombre = sucursalData?.nombre || null;
    }

    const turnoPayload = {
      id:              turno.id,
      user_id:         req.user.id,
      nombre:          turno.nombre,
      telefono:        turno.telefono,
      fecha:           turno.fecha,
      hora:            turno.hora,
      servicio_nombre: turno.servicio_nombre,
      servicio_zona:   turno.servicio_zona,
      duracion:        turno.duracion,
      sucursal_nombre: sucursalNombre,
    };

    if (cambioEstado && estado === 'cancelado') {
      enviarCancelacionTurno(turnoPayload).catch(err => {
        console.error('[TURNOS/actualizar] Error cancelación:', err.message);
      });
    } else if ((fechaCambio || horaCambio) && estado !== 'cancelado') {
      enviarModificacionTurno(turnoPayload).catch(err => {
        console.error('[TURNOS/actualizar] Error modificación:', err.message);
      });
    }

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
    const existente = await Turnos.buscarPorId(req.params.id, req.user.id);
    if (!existente) {
      return res.status(404).json({
        ok:    false,
        error: 'Turno no encontrado',
      });
    }

    const eliminado = await Turnos.eliminar(req.params.id, req.user.id);

    if (!eliminado) {
      return res.status(404).json({
        ok:    false,
        error: 'Turno no encontrado',
      });
    }

    // Buscar nombre de sucursal para el mensaje
    let sucursalNombre = null;
    if (existente.sucursal_id) {
      const sucursalData = await Sucursales.obtenerHorarios(existente.sucursal_id, req.user.id);
      sucursalNombre = sucursalData?.nombre || null;
    }

    enviarCancelacionTurno({
      id:              existente.id,
      user_id:         req.user.id,
      nombre:          existente.nombre,
      telefono:        existente.telefono,
      fecha:           existente.fecha,
      hora:            existente.hora,
      servicio_nombre: existente.servicio_nombre,
      duracion:        existente.duracion,
      sucursal_nombre: sucursalNombre,
    }).catch(err => {
      console.error('[TURNOS/eliminar] Error WA cancelación:', err.message);
    });

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