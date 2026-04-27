'use strict';

const router   = require('express').Router();
const { body, param } = require('express-validator');
const ctrl     = require('../controllers/turnos.controller');
const { autenticar } = require('../middleware/auth');
const { planActivo } = require('../middleware/planGuard');
const { validar }    = require('../middleware/validate');
const { apiLimiter } = require('../middleware/rateLimiter');

// Todos los endpoints requieren auth + plan activo
router.use(autenticar);
router.use(planActivo);
router.use(apiLimiter);

// ─── Validaciones ────────────────────────────────────────────
const validarTurno = [
  body('nombre')
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 255 }).withMessage('Nombre entre 2 y 255 caracteres')
    .trim(),
  body('telefono')
    .notEmpty().withMessage('El teléfono es requerido')
    .isLength({ min: 6, max: 50 }).withMessage('Teléfono inválido')
    .trim(),
  body('duracion')
    .isInt({ min: 5, max: 480 }).withMessage('Duración entre 5 y 480 minutos'),
  body('fecha')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Fecha inválida. Formato: YYYY-MM-DD'),
  body('hora')
    .matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Hora inválida. Formato: HH:MM'),
  body('servicio_nombre')
    .optional()
    .isLength({ max: 255 }).withMessage('Nombre de servicio muy largo')
    .trim(),
  body('servicio_zona')
    .optional()
    .isLength({ max: 255 }).withMessage('Zona muy larga')
    .trim(),
  body('servicio_color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color inválido. Formato: #RRGGBB'),
  body('notas')
    .optional()
    .isLength({ max: 1000 }).withMessage('Notas muy largas')
    .trim(),
  body('cumple_dia')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 31 }).withMessage('Día de cumpleaños inválido'),
  body('cumple_mes')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 12 }).withMessage('Mes de cumpleaños inválido'),
];

const validarId = [
  param('id')
    .isUUID().withMessage('ID inválido'),
];

// ─── Rutas ───────────────────────────────────────────────────

// GET /api/turnos/cumples — ANTES de /:id para no confundir rutas
router.get('/cumples', ctrl.getCumples);

// GET /api/turnos
router.get('/', ctrl.listar);

// GET /api/turnos/:id
router.get('/:id',
  validarId,
  validar,
  ctrl.obtener
);

// POST /api/turnos
router.post('/',
  validarTurno,
  validar,
  ctrl.crear
);

// PUT /api/turnos/:id
router.put('/:id',
  validarId,
  validarTurno,
  validar,
  ctrl.actualizar
);

// DELETE /api/turnos/:id
router.delete('/:id',
  validarId,
  validar,
  ctrl.eliminar
);


// POST /api/turnos/:id/confirmar-senia — marcar seña como pagada y notificar
router.post('/:id/confirmar-senia',
  [param('id').isUUID()],
  validar,
  async (req, res) => {
    try {
      const { query } = require('../config/db');
      const nodemailer = require('nodemailer');

      const { rows } = await query(
        `UPDATE turnos
         SET senia_pagada = TRUE,
             estado_pago  = 'pagado',
             estado       = 'activo',
             editado_en   = NOW()
         WHERE id = $1 AND user_id = $2
           AND senia_requerida = TRUE
           AND senia_pagada    = FALSE
         RETURNING *`,
        [req.params.id, req.user.id]
      );

      if (!rows.length) {
        return res.status(400).json({ ok: false, error: 'Turno no encontrado o seña ya registrada' });
      }
      const turno = rows[0];

      // Buscar datos de la estética para el mail
      const { rows: uRows } = await query(
        `SELECT nombre, nombre_negocio, telefono FROM usuarios WHERE id = $1`,
        [req.user.id]
      );
      const estetica = uRows[0] || {};

      // Enviar mail de confirmación a la clienta si tiene email
      if (turno.telefono && turno.telefono.includes('@')) {
        const t = nodemailer.createTransport({
          host: process.env.MAIL_HOST, port: parseInt(process.env.MAIL_PORT)||587,
          secure: process.env.MAIL_SECURE==='true',
          auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
        });
        const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const [a,m,d] = turno.fecha.toString().split('T')[0].split('-');
        const fechaStr = `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${a}`;
        const horaStr  = turno.hora.toString().slice(0,5);
        const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#FAF6F7;padding:24px;border-radius:14px;">
          <h2 style="color:#A85568;">🌸 ¡Turno confirmado!</h2>
          <p style="color:#4A3840;">Hola <strong>${turno.nombre}</strong>, tu seña fue registrada y tu turno está confirmado:</p>
          <table style="width:100%;background:#fff;border-radius:10px;padding:16px;margin:12px 0;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">📅 Fecha</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${fechaStr}</td></tr>
            <tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">🕐 Hora</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${horaStr} hs</td></tr>
            ${turno.servicio_nombre ? `<tr><td style="padding:6px 0;color:#6B5A60;font-size:14px;">✂️ Servicio</td><td style="padding:6px 0;font-weight:700;color:#4A3840;">${turno.servicio_nombre}</td></tr>` : ''}
          </table>
          <p style="color:#2D7A4F;font-weight:700;font-size:14px;">✅ Seña de $${turno.monto_senia} acreditada</p>
          <p style="color:#9A8F92;font-size:12px;margin-top:16px;">© 2025 DEPIMÓVIL PRO</p>
        </div>`;
        try {
          await t.sendMail({
            from: `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
            to: turno.telefono,
            subject: '🌸 ¡Tu turno está confirmado!',
            text: `Hola ${turno.nombre}, tu seña fue registrada. Tu turno del ${fechaStr} a las ${horaStr} está confirmado.`,
            html,
          });
        } catch(e) { console.error('[MAILER] Error confirmación seña:', e.message); }
      }

      return res.json({ ok: true, mensaje: '✅ Seña registrada. Turno confirmado.', turno });
    } catch(err) {
      console.error('[TURNOS/confirmar-senia]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al confirmar seña' });
    }
  }
);

module.exports = router;