'use strict';

const router   = require('express').Router();
const { body, param } = require('express-validator');
const ctrl     = require('../controllers/admin.controller');
const { autenticar }      = require('../middleware/auth');
const { soloAdmin }       = require('../middleware/roles');
const { validar }         = require('../middleware/validate');
const { estrictoLimiter } = require('../middleware/rateLimiter');

// Todos los endpoints requieren auth + rol admin
router.use(autenticar);
router.use(soloAdmin);


// ─── Validaciones ────────────────────────────────────────────
const validarCrearUsuario = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  body('nombre')
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 255 }).withMessage('Nombre entre 2 y 255 caracteres')
    .trim(),
  body('plan')
    .optional()
    .isIn(['trial', 'premium']).withMessage('Plan inválido'),
  body('dias_trial')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Días de trial entre 1 y 365'),
  body('rol')
    .optional()
    .isIn(['cliente', 'admin']).withMessage('Rol inválido'),
];

const validarInvitacion = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('plan')
    .optional()
    .isIn(['trial', 'premium']).withMessage('Plan inválido'),
  body('dias_trial')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Días de trial entre 1 y 365'),
];

const validarPlan = [
  body('plan')
    .isIn(['trial', 'premium']).withMessage('Plan inválido'),
  body('dias_trial')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Días de trial entre 1 y 365'),
];

const validarActivo = [
  body('activo')
    .isBoolean().withMessage('El campo activo debe ser true o false'),
];

const validarId = [
  param('id')
    .isUUID().withMessage('ID inválido'),
];

function normalizarUrlAbsoluta(url, fallbackOrigin) {
  const valor = String(url || '').trim();
  if (!valor) return null;

  try {
    return new URL(valor).toString();
  } catch {
    try {
      return new URL(valor.startsWith('/') ? valor : `/${valor}`, fallbackOrigin).toString();
    } catch {
      return null;
    }
  }
}

function obtenerOrigenPublico(link) {
  try {
    return new URL(link).origin;
  } catch {
    return String(process.env.CORS_ORIGIN || '').replace(/\/$/, '');
  }
}

// ─── Rutas ───────────────────────────────────────────────────

// GET /api/admin/usuarios
router.get('/usuarios', ctrl.listarUsuarios);

// POST /api/admin/usuarios
router.post('/usuarios',
  validarCrearUsuario,
  validar,
  ctrl.crearUsuario
);

// PUT /api/admin/usuarios/:id/activo
router.put('/usuarios/:id/activo',
  validarId,
  validarActivo,
  validar,
  ctrl.toggleActivo
);

// PUT /api/admin/usuarios/:id/plan
router.put('/usuarios/:id/plan',
  validarId,
  validarPlan,
  validar,
  ctrl.cambiarPlan
);

// DELETE /api/admin/usuarios/:id
router.delete('/usuarios/:id',
  validarId,
  validar,
  ctrl.eliminarUsuario
);

// POST /api/admin/invitaciones
router.post('/invitaciones',
  validarInvitacion,
  validar,
  ctrl.crearInvitacion
);

// GET /api/admin/invitaciones
router.get('/invitaciones', ctrl.listarInvitaciones);

// PUT /api/admin/usuarios/:id — editar datos de clienta
router.put('/usuarios/:id',
  [
    param('id').isUUID(),
    body('nombre').notEmpty().trim().isLength({ min: 2, max: 255 }),
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
    body('nombre_negocio').optional().trim(),
    body('telefono').optional().trim(),
  ],
  validar,
  async (req, res) => {
    try {
      const { nombre, email, password, nombre_negocio, telefono } = req.body;
      const { query } = require('../config/db');
      const bcrypt    = require('bcryptjs');

      // Verificar que existe
      const { rows: existing } = await query(
        `SELECT id FROM usuarios WHERE id = $1`,
        [req.params.id]
      );
      if (!existing.length) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      // Verificar email único (si cambió)
      const { rows: emailCheck } = await query(
        `SELECT id FROM usuarios WHERE email = $1 AND id != $2`,
        [email, req.params.id]
      );
      if (emailCheck.length) {
        return res.status(409).json({ ok: false, error: 'Ese email ya está en uso' });
      }

      let sql, params;
      if (password) {
        const passwordHash = await bcrypt.hash(password, 12);
        sql = `UPDATE usuarios SET
                 nombre         = $1,
                 email          = $2,
                 nombre_negocio = $3,
                 telefono       = $4,
                 password_hash  = $5
               WHERE id = $6
               RETURNING id, email, nombre, nombre_negocio, telefono, rol, plan, activo`;
        params = [nombre, email, nombre_negocio || null, telefono || null, passwordHash, req.params.id];
      } else {
        sql = `UPDATE usuarios SET
                 nombre         = $1,
                 email          = $2,
                 nombre_negocio = $3,
                 telefono       = $4
               WHERE id = $5
               RETURNING id, email, nombre, nombre_negocio, telefono, rol, plan, activo`;
        params = [nombre, email, nombre_negocio || null, telefono || null, req.params.id];
      }

      const { rows } = await query(sql, params);
      return res.json({ ok: true, mensaje: 'Clienta actualizada', usuario: rows[0] });

    } catch(err) {
      console.error('[ADMIN/editarUsuario]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al actualizar la clienta' });
    }
  }
);

// POST /api/admin/enviar-link — enviar link útil a nueva operadora por mail
router.post('/enviar-link',
  [
    body('email').isEmail().normalizeEmail(),
    body('nombre').notEmpty().trim(),
    body('link').notEmpty(),
  ],
  validar,
  async (req, res) => {
    try {
      const { email, nombre, link } = req.body;
      const nodemailer = require('nodemailer');

      const origenPublico = obtenerOrigenPublico(link);
      const linkAgenda = normalizarUrlAbsoluta(link, origenPublico);
      const linkPanel = normalizarUrlAbsoluta('/login.html', origenPublico);

      if (!linkAgenda || !linkPanel) {
        return res.status(400).json({ ok: false, error: 'Link inválido para enviar por mail' });
      }

      const t = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: parseInt(process.env.MAIL_PORT) || 587,
        secure: process.env.MAIL_SECURE === 'true',
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      });

      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#FAF6F7;padding:24px;border-radius:14px;">
        <div style="background:#A85568;border-radius:10px 10px 0 0;padding:24px;text-align:center;">
          <p style="margin:0;font-size:28px;">🌸</p>
          <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">DEPIMÓVIL PRO</h1>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;">
          <h2 style="color:#4A3840;font-size:18px;margin:0 0 12px;">¡Hola ${nombre}! 🌸</h2>
          <p style="color:#6B5A60;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Te compartimos los accesos importantes para empezar a usar tu agenda.
          </p>

          <div style="text-align:center;margin:20px 0;">
            <a href="${linkPanel}" style="display:inline-block;background:#A85568;color:white;font-weight:700;padding:14px 28px;border-radius:100px;text-decoration:none;font-size:15px;">
              🌸 Entrar a mi AgendaMóvil
            </a>
          </div>

          <div style="background:#FAF6F7;border:1px solid #F0E4E8;border-radius:12px;padding:16px;margin:18px 0;">
            <p style="color:#4A3840;font-size:14px;line-height:1.5;margin:0 0 10px;">
              Este es tu link público para que tus clientas puedan reservar turno:
            </p>
            <p style="word-break:break-all;margin:0;">
              <a href="${linkAgenda}" style="color:#A85568;font-size:13px;">${linkAgenda}</a>
            </p>
          </div>

          <p style="color:#9A8F92;font-size:13px;margin:16px 0 0;text-align:center;line-height:1.5;">
            Si el botón no abre, copiá y pegá este link en el navegador:<br>
            <a href="${linkPanel}" style="color:#A85568;word-break:break-all;">${linkPanel}</a>
          </p>
        </div>
        <p style="color:#9A8F92;font-size:12px;margin-top:16px;text-align:center;">© 2026 DEPIMÓVIL PRO</p>
      </div>`;

      await t.sendMail({
        from:    `"DEPIMÓVIL PRO" <${process.env.MAIL_USER}>`,
        to:      email,
        subject: '🌸 Tus accesos a AgendaMóvil PRO',
        text:    `Hola ${nombre}. Entrá a tu AgendaMóvil acá: ${linkPanel}\n\nTu link público de reservas: ${linkAgenda}`,
        html,
      });

      return res.json({ ok: true, mensaje: 'Accesos enviados exitosamente' });
    } catch(err) {
      console.error('[ADMIN/enviar-link]', err.message);
      return res.status(500).json({ ok: false, error: 'Error al enviar el mail' });
    }
  }
);

module.exports = router;
