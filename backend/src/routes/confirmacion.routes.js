'use strict';

// ══════════════════════════════════════════════════════════════════
//  CONFIRMACIÓN DEL TURNO CON UN TOQUE
//
//  El recordatorio de 24 horas le manda a la clienta un link con dos
//  botones. Es a propósito un link y no un "respondé SÍ": AgendaMóvil
//  solo ENVÍA por WhatsApp, no lee las respuestas, así que si pidiéramos
//  contestar la app nunca se enteraría.
//
//  Rutas públicas, sin token de sesión: la clienta no tiene cuenta.
//  Lo único que protege el link es un UUID aleatorio por turno.
// ══════════════════════════════════════════════════════════════════

const router = require('express').Router();
const { param, body } = require('express-validator');
const { query } = require('../config/db');
const { validar } = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);

const validarToken = [param('token').isUUID().withMessage('Link inválido')];

// Datos del turno para pintar la página. No devuelve teléfono ni notas:
// cualquiera con el link los vería, y no hacen falta para confirmar.
router.get('/:token', validarToken, validar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.nombre, t.fecha, t.hora, t.duracion,
              t.servicio_nombre, t.servicio_zona, t.estado,
              t.confirmacion_estado,
              u.nombre_negocio, u.nombre AS user_nombre,
              -- sucursales no tiene columna de dirección: solo nombre, tipo,
              -- horarios, max_turnos_hora y activo. No inventar campos acá.
              s.nombre AS sucursal_nombre
         FROM turnos t
         JOIN usuarios u ON u.id = t.user_id
         LEFT JOIN sucursales s ON s.id = t.sucursal_id
        WHERE t.confirmacion_token = $1`,
      [req.params.token]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Este link no es válido o ya venció' });
    }

    const t = rows[0];
    return res.json({
      ok: true,
      turno: {
        nombre:          t.nombre,
        fecha:           t.fecha,
        hora:            t.hora,
        duracion:        t.duracion,
        servicio:        t.servicio_nombre,
        zona:            t.servicio_zona,
        sucursal:        t.sucursal_nombre,
        negocio:         t.nombre_negocio || t.user_nombre,
        estado:          t.estado,
        confirmacion:    t.confirmacion_estado,
      },
    });
  } catch (err) {
    console.error('[CONFIRMACION/ver]', err.message);
    return res.status(500).json({ ok: false, error: 'No se pudo cargar el turno' });
  }
});

// La clienta toca uno de los dos botones.
router.post('/:token',
  validarToken,
  [body('respuesta').isIn(['si', 'no']).withMessage('Respuesta inválida')],
  validar,
  async (req, res) => {
    try {
      const viene = req.body.respuesta === 'si';

      // Se resuelve en una sola consulta para que dos toques seguidos no
      // puedan pisarse. Si ya estaba respondido, no se cambia.
      const { rows } = await query(
        `UPDATE turnos
            SET confirmacion_estado = $2,
                confirmacion_en     = NOW(),
                estado              = CASE WHEN $2 = 'rechazado' THEN 'cancelado' ELSE estado END,
                editado_en          = NOW()
          WHERE confirmacion_token = $1
            AND estado != 'cancelado'
            AND confirmacion_estado IN ('sin_pedir', 'pendiente')
          RETURNING id, user_id, nombre, telefono, fecha, hora,
                    servicio_nombre, confirmacion_estado`,
        [req.params.token, viene ? 'confirmado' : 'rechazado']
      );

      if (!rows.length) {
        // O el link no existe, o ya lo respondió antes. Se le muestra el
        // estado actual en vez de un error seco.
        const { rows: actual } = await query(
          `SELECT confirmacion_estado, estado FROM turnos WHERE confirmacion_token = $1`,
          [req.params.token]
        );
        if (!actual.length) {
          return res.status(404).json({ ok: false, error: 'Este link no es válido' });
        }
        return res.json({
          ok: true,
          yaRespondido: true,
          confirmacion: actual[0].confirmacion_estado,
          estado: actual[0].estado,
        });
      }

      const turno = rows[0];
      console.log(`[CONFIRMACION] turno=${turno.id} → ${turno.confirmacion_estado}`);

      // Avisarle a la operadora. Se hace sin await para no dejar a la
      // clienta esperando a WhatsApp: si falla, el estado ya quedó guardado
      // y ella lo ve igual en la agenda.
      avisarOperadora(turno).catch(err =>
        console.error('[CONFIRMACION/aviso]', err.message)
      );

      return res.json({ ok: true, confirmacion: turno.confirmacion_estado });

    } catch (err) {
      console.error('[CONFIRMACION/responder]', err.message);
      return res.status(500).json({ ok: false, error: 'No se pudo registrar tu respuesta' });
    }
  }
);

// ─── Aviso a la operadora ─────────────────────────────────────────────
async function avisarOperadora(turno) {
  const evolution = require('../services/evolution.service');

  const { rows } = await query(
    `SELECT telefono, codigo_pais FROM usuarios WHERE id = $1`,
    [turno.user_id]
  );
  if (!rows.length || !rows[0].telefono) return;

  const hora  = (turno.hora || '').slice(0, 5);
  const fecha = (turno.fecha instanceof Date
    ? turno.fecha.toISOString().slice(0, 10)
    : String(turno.fecha).slice(0, 10)
  ).split('-').reverse().join('/');

  const confirmado = turno.confirmacion_estado === 'confirmado';
  const mensaje = confirmado
    ? `✅ *${turno.nombre}* confirmó su turno\n\n📅 ${fecha} · ${hora} hs` +
      (turno.servicio_nombre ? `\n✨ ${turno.servicio_nombre}` : '')
    : `❌ *${turno.nombre}* avisó que *no va a poder venir*\n\n` +
      `📅 ${fecha} · ${hora} hs` +
      (turno.servicio_nombre ? `\n✨ ${turno.servicio_nombre}` : '') +
      `\n\nEse horario te quedó libre. Todavía estás a tiempo de ofrecérselo a otra clienta 💪`;

  const instancia = `user_${turno.user_id}`;
  const estado = await evolution.estadoInstancia(instancia);
  if (!estado.ok || estado.estado !== 'open') {
    console.log(`[CONFIRMACION] usuario ${turno.user_id} sin WhatsApp conectado`);
    return;
  }
  await evolution.enviarMensaje(instancia, rows[0].telefono, mensaje);
}

module.exports = router;
