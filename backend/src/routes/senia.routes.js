'use strict';

const router = require('express').Router();
const { body, param } = require('express-validator');
const { autenticar }  = require('../middleware/auth');
const { planActivo }  = require('../middleware/planGuard');
const { validar }     = require('../middleware/validate');
const { apiLimiter }  = require('../middleware/rateLimiter');
const { query }       = require('../config/db');

router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

// ═══════════════════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════════════════
async function getServicioConSenia(servicioId, userId) {
  const { rows } = await query(
    `SELECT id, nombre, duracion, requiere_senia, monto_senia
     FROM servicios
     WHERE id = $1 AND user_id = $2`,
    [servicioId, userId]
  );
  return rows[0] || null;
}

async function crearTurnoConSenia(userId, datos) {
  const {
    servicioId, nombre, telefono,
    servicioNombre, servicioZona, servicioColor,
    duracion, fecha, hora, notas,
    cumpleDia, cumpleMes,
    seniaRequerida, montosenia, estadoPago,
  } = datos;

  const { rows } = await query(
    `INSERT INTO turnos
       (user_id, servicio_id, nombre, telefono,
        servicio_nombre, servicio_zona, servicio_color,
        duracion, fecha, hora, notas,
        cumple_dia, cumple_mes,
        senia_requerida, senia_pagada, monto_senia, estado_pago)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      userId,
      servicioId     || null,
      nombre,
      telefono,
      servicioNombre || null,
      servicioZona   || null,
      servicioColor  || '#A85568',
      duracion,
      fecha,
      hora,
      notas          || null,
      cumpleDia      || null,
      cumpleMes      || null,
      seniaRequerida || false,
      false,
      montosenia     || 0,
      estadoPago     || 'no_aplica',
    ]
  );
  return rows[0];
}

async function pagarSenia(turnoId, userId) {
  const { rows } = await query(
    `UPDATE turnos
     SET senia_pagada = TRUE,
         estado_pago  = 'pagado',
         editado_en   = NOW()
     WHERE id = $1 AND user_id = $2
       AND senia_requerida = TRUE
       AND senia_pagada    = FALSE
     RETURNING *`,
    [turnoId, userId]
  );
  return rows[0] || null;
}

async function getTurnoConSenia(turnoId, userId) {
  const { rows } = await query(
    `SELECT * FROM turnos WHERE id = $1 AND user_id = $2`,
    [turnoId, userId]
  );
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════
//  POST /api/senia/turnos  — crear turno con lógica de seña
// ═══════════════════════════════════════════════════════════
const validarTurno = [
  body('nombre').notEmpty().trim().isLength({ min: 2, max: 255 }),
  body('telefono').notEmpty().trim().isLength({ min: 6, max: 50 }),
  body('fecha').matches(/^\d{4}-\d{2}-\d{2}$/),
  body('hora').matches(/^\d{2}:\d{2}(:\d{2})?$/),
  body('duracion').isInt({ min: 5, max: 480 }),
  body('servicio_id').optional().isUUID(),
];

router.post('/turnos', validarTurno, validar, async (req, res) => {
  try {
    const {
      servicio_id, nombre, telefono, fecha, hora, duracion,
      servicio_nombre, servicio_zona, servicio_color,
      notas, cumple_dia, cumple_mes,
    } = req.body;

    let seniaRequerida = false;
    let montoSenia     = 0;
    let estadoPago     = 'no_aplica';
    let servicioNombre = servicio_nombre || null;
    let servicioZona   = servicio_zona   || null;
    let servicioColor  = servicio_color  || '#A85568';
    let duracionFinal  = duracion;

    // ── Si viene servicio_id, copiar datos y seña del servicio ──
    if (servicio_id) {
      const servicio = await getServicioConSenia(servicio_id, req.user.id);
      if (!servicio) {
        return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
      }
      servicioNombre = servicio.nombre;
      duracionFinal  = servicio.duracion;

      if (servicio.requiere_senia && servicio.monto_senia > 0) {
        seniaRequerida = true;
        montoSenia     = servicio.monto_senia;
        estadoPago     = 'pendiente';
      }
    }

    const turno = await crearTurnoConSenia(req.user.id, {
      servicioId:     servicio_id     || null,
      nombre,
      telefono,
      servicioNombre,
      servicioZona,
      servicioColor,
      duracion:       duracionFinal,
      fecha,
      hora,
      notas:          notas           || null,
      cumpleDia:      cumple_dia      || null,
      cumpleMes:      cumple_mes      || null,
      seniaRequerida,
      montosenia:     montoSenia,
      estadoPago,
    });

    return res.status(201).json({
      ok:    true,
      turno,
      aviso: seniaRequerida
        ? `⚠️ Este turno requiere una seña de $${montoSenia}. El turno no está confirmado hasta que se acredite.`
        : null,
    });

  } catch (err) {
    console.error('[SENIA/crearTurno]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear el turno' });
  }
});

// ═══════════════════════════════════════════════════════════
//  POST /api/senia/turnos/:id/pagar-senia
// ═══════════════════════════════════════════════════════════
router.post('/turnos/:id/pagar-senia',
  [param('id').isUUID()],
  validar,
  async (req, res) => {
    try {
      const turno = await getTurnoConSenia(req.params.id, req.user.id);

      if (!turno) {
        return res.status(404).json({ ok: false, error: 'Turno no encontrado' });
      }
      if (!turno.senia_requerida) {
        return res.status(400).json({ ok: false, error: 'Este turno no requiere seña' });
      }
      if (turno.senia_pagada) {
        return res.status(400).json({ ok: false, error: 'La seña ya fue registrada' });
      }
      if (turno.estado === 'cancelado') {
        return res.status(400).json({ ok: false, error: 'El turno está cancelado' });
      }

      const turnoActualizado = await pagarSenia(req.params.id, req.user.id);
      if (!turnoActualizado) {
        return res.status(500).json({ ok: false, error: 'No se pudo actualizar la seña' });
      }

      return res.json({
        ok:      true,
        mensaje: '✅ Seña registrada. Turno confirmado.',
        turno:   turnoActualizado,
      });

    } catch (err) {
      console.error('[SENIA/pagarSenia]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al registrar la seña' });
    }
  }
);

// ═══════════════════════════════════════════════════════════
//  GET /api/senia/turnos/pendientes — turnos sin seña pagar
// ═══════════════════════════════════════════════════════════
router.get('/turnos/pendientes', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, telefono, fecha, hora,
              servicio_nombre, monto_senia, estado_pago, creado_en
       FROM turnos
       WHERE user_id        = $1
         AND senia_requerida = TRUE
         AND senia_pagada    = FALSE
         AND estado         != 'cancelado'
       ORDER BY fecha ASC, hora ASC`,
      [req.user.id]
    );
    return res.json({ ok: true, turnos: rows, total: rows.length });
  } catch (err) {
    console.error('[SENIA/pendientes]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener turnos pendientes' });
  }
});

// ═══════════════════════════════════════════════════════════
//  VALIDACIÓN: turno confirmado solo si seña pagada
//  Middleware exportable para usar en otras rutas
// ═══════════════════════════════════════════════════════════
async function verificarSeniaPagada(req, res, next) {
  try {
    const turno = await getTurnoConSenia(req.params.id, req.user.id);
    if (!turno) {
      return res.status(404).json({ ok: false, error: 'Turno no encontrado' });
    }
    if (turno.senia_requerida && !turno.senia_pagada) {
      return res.status(402).json({
        ok:     false,
        error:  'Turno no confirmado. Se requiere el pago de la seña primero.',
        monto:  turno.monto_senia,
        estado: turno.estado_pago,
      });
    }
    req.turno = turno;
    next();
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al verificar seña' });
  }
}

module.exports = router;
module.exports.verificarSeniaPagada = verificarSeniaPagada;
