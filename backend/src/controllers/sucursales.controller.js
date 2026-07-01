'use strict';

const { Sucursales } = require('../models/queries');
const { query } = require('../config/db');

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

async function contarSucursalesActivas(userId, excluirId = null) {
  const params = [userId];
  let sql = `SELECT COUNT(*)::int AS total FROM sucursales WHERE user_id = $1 AND activo = true`;

  if (excluirId) {
    params.push(excluirId);
    sql += ` AND id != $2`;
  }

  const { rows } = await query(sql, params);
  return rows[0]?.total || 0;
}

async function contarTurnosSucursal(userId, sucursalId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM turnos
     WHERE user_id = $1 AND sucursal_id = $2 AND estado != 'cancelado'`,
    [userId, sucursalId]
  );
  return rows[0]?.total || 0;
}

async function crear(req, res) {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    const tipo = String(req.body?.tipo || 'sucursal').trim();
    const maxTurnosHora = Number(req.body?.max_turnos_hora || 1);

    if (!nombre) {
      return res.status(422).json({ ok: false, error: 'Nombre requerido' });
    }
    if (!['profesional', 'sucursal'].includes(tipo)) {
      return res.status(422).json({ ok: false, error: 'Tipo inválido. Usá "profesional" o "sucursal"' });
    }
    if (!Number.isInteger(maxTurnosHora) || maxTurnosHora < 1 || maxTurnosHora > 20) {
      return res.status(422).json({ ok: false, error: 'max_turnos_hora inválido (1-20)' });
    }

    const sucursal = await Sucursales.crear(req.user.id, { nombre, tipo, maxTurnosHora });
    return res.status(201).json({ ok: true, sucursal });
  } catch (err) {
    console.error('[SUCURSALES/crear]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear' });
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

async function cambiarActivo(req, res) {
  try {
    const activo = Boolean(req.body?.activo);
    const sucursal = await Sucursales.buscarPorId(req.params.id, req.user.id);

    if (!sucursal) {
      return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
    }

    if (!activo) {
      const otrasActivas = await contarSucursalesActivas(req.user.id, req.params.id);
      if (otrasActivas < 1) {
        return res.status(409).json({
          ok: false,
          error: 'No podés desactivar la única sucursal activa. Activá o creá otra sucursal primero.',
        });
      }
    }

    const { rows } = await query(
      `UPDATE sucursales
       SET activo = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id, nombre, tipo, horarios, max_turnos_hora, activo, created_at`,
      [activo, req.params.id, req.user.id]
    );

    return res.json({
      ok: true,
      mensaje: activo ? 'Sucursal activada' : 'Sucursal desactivada',
      sucursal: rows[0],
    });
  } catch (err) {
    console.error('[SUCURSALES/cambiarActivo]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al cambiar estado de sucursal' });
  }
}

async function eliminar(req, res) {
  try {
    const sucursal = await Sucursales.buscarPorId(req.params.id, req.user.id);

    if (!sucursal) {
      return res.status(404).json({ ok: false, error: 'Sucursal no encontrada' });
    }

    const turnosAsociados = await contarTurnosSucursal(req.user.id, req.params.id);

    if (turnosAsociados > 0) {
      const otrasActivas = await contarSucursalesActivas(req.user.id, req.params.id);
      if (sucursal.activo && otrasActivas < 1) {
        return res.status(409).json({
          ok: false,
          error: 'Esta sucursal tiene turnos y es la única activa. Creá o activá otra sucursal antes de quitarla.',
        });
      }

      const { rows } = await query(
        `UPDATE sucursales
         SET activo = false
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, nombre, tipo, horarios, max_turnos_hora, activo, created_at`,
        [req.params.id, req.user.id]
      );

      return res.json({
        ok: true,
        soft_delete: true,
        mensaje: 'Sucursal desactivada. Conservamos los turnos históricos asociados.',
        sucursal: rows[0],
      });
    }

    await query(
      `UPDATE servicios
       SET sucursal_ids = COALESCE(
         (
           SELECT array_agg(x)
           FROM unnest(COALESCE(sucursal_ids, ARRAY[]::uuid[])) AS x
           WHERE x != $1::uuid
         ),
         ARRAY[]::uuid[]
       )
       WHERE user_id = $2`,
      [req.params.id, req.user.id]
    );

    const { rowCount } = await query(
      `DELETE FROM sucursales WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    return res.json({
      ok: rowCount > 0,
      mensaje: 'Sucursal eliminada',
    });
  } catch (err) {
    console.error('[SUCURSALES/eliminar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar sucursal' });
  }
}

module.exports = {
  crear,
  listar,
  obtenerHorarios,
  guardarHorarios,
  cambiarActivo,
  eliminar,
};
