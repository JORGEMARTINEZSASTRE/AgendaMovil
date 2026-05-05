'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { query }    = require('../config/db');
const { autenticar } = require('../middleware/auth');

// ── Multer: fotos de sesión ──────────────────────────
const storageSesion = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/fichas_medicas');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `sesion_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const uploadSesion = multer({
  storage: storageSesion,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

// ── Multer: foto de servicio ─────────────────────────
const storageServicio = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/fotosServicio');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `serv_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const uploadServicio = multer({
  storage: storageServicio,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

// ════════════════════════════════════════════════
// FICHAS CLÍNICAS
// ════════════════════════════════════════════════

router.get('/ficha/:telefono', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM fichas_clinicas WHERE user_id=$1 AND telefono=$2',
      [req.user.id, req.params.telefono]
    );
    if (!rows.length) return res.json({ ficha: null, sesiones: [] });

    const sesiones = await query(
      `SELECT sc.*, t.fecha as turno_fecha, t.hora as turno_hora, t.servicio_nombre
       FROM sesiones_clinicas sc
       LEFT JOIN turnos t ON t.id = sc.turno_id
       WHERE sc.ficha_id=$1
       ORDER BY sc.fecha DESC, sc.creado_en DESC`,
      [rows[0].id]
    );
    res.json({ ficha: rows[0], sesiones: sesiones.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/ficha', autenticar, async (req, res) => {
  const d   = req.body;
  const uid = req.user.id;

  const campos = [
    'nombre','documento','fecha_nacimiento','email','direccion','ocupacion',
    'motivo_principal','zonas_a_tratar','expectativas','tiempo_evolucion',
    'enfermedades_actuales','enfermedades_cronicas','trastornos_hormonales',
    'enfermedades_dermatologicas','alergias','medicacion_actual',
    'embarazo_lactancia','cirugias_previas','implantes_protesis',
    'tratamientos_previos','depilacion_laser_ipl','uso_aparatologia',
    'peelings_dermapen_prp','reacciones_adversas','frecuencia_tratamientos',
    'exposicion_solar','uso_protector_solar','tabaquismo','alcohol',
    'actividad_fisica','alimentacion','consumo_agua','tipo_piel',
    'fototipo_fitzpatrick','hidratacion','elasticidad','sebo',
    'alteraciones_presentes','diagnostico_estetico','objetivo',
    'tratamientos_indicados','zonas_plan','frecuencia_plan','duracion_plan',
    'combinacion_tecnicas','respuesta_tratamiento','cambios_observados',
    'ajustes','procedimiento_explicado','riesgos_informados','firma_paciente',
    'firma_profesional','fecha_consentimiento','zona_documentada',
    'rutina_cosmetica','cuidados_post','recomendaciones','observaciones_generales'
  ];

  try {
    const existe = await query(
      'SELECT id FROM fichas_clinicas WHERE user_id=$1 AND telefono=$2',
      [uid, d.telefono]
    );

    if (existe.rows.length) {
      const sets = campos.map((c, i) => `${c}=$${i + 1}`).join(',');
      const vals = campos.map(c => d[c] ?? null);
      await query(
        `UPDATE fichas_clinicas SET ${sets}, editado_en=NOW()
         WHERE user_id=$${campos.length + 1} AND telefono=$${campos.length + 2}`,
        [...vals, uid, d.telefono]
      );
      return res.json({ ok: true, accion: 'actualizada' });
    }

    const cols   = ['user_id','telefono',...campos].join(',');
    const phs    = ['$1','$2',...campos.map((_, i) => `$${i + 3}`)].join(',');
    const vals   = [uid, d.telefono, ...campos.map(c => d[c] ?? null)];
    const result = await query(
      `INSERT INTO fichas_clinicas (${cols}) VALUES (${phs}) RETURNING id`,
      vals
    );
    res.json({ ok: true, accion: 'creada', id: result.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════
// SESIONES CLÍNICAS
// ════════════════════════════════════════════════

router.post('/sesion', autenticar, uploadSesion.array('fotos', 10), async (req, res) => {
  try {
    const { ficha_id, turno_id, tratamiento, parametros, observaciones, profesional, proxima_fecha, proxima_hora } = req.body;
    const fotos = req.files ? req.files.map(f => `/fichas_medicas/${f.filename}`) : [];

    const { rows } = await query(
      `INSERT INTO sesiones_clinicas (ficha_id, turno_id, tratamiento, parametros, observaciones, profesional, fotos)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [ficha_id, turno_id || null, tratamiento, parametros, observaciones, profesional, fotos]
    );

    // Si hay próxima fecha/hora, crear turno en la agenda
    if (proxima_fecha && proxima_hora) {
      const fichaRes = await query(
        'SELECT nombre, telefono FROM fichas_clinicas WHERE id = $1 AND user_id = $2',
        [ficha_id, req.user.id]
      );

      if (fichaRes.rows.length) {
        const { nombre, telefono } = fichaRes.rows[0];

        // Obtener duración y servicio del turno original si existe
        let duracion = 60;
        let servicioNombre = tratamiento || 'Sesión de tratamiento';
        let servicioZona = null;
        let servicioColor = '#A85568';
        let sucursalId = null;

        if (turno_id) {
          const turnoRes = await query(
            'SELECT duracion, servicio_nombre, servicio_zona, servicio_color, sucursal_id FROM turnos WHERE id = $1 AND user_id = $2',
            [turno_id, req.user.id]
          );
          if (turnoRes.rows.length) {
            duracion = turnoRes.rows[0].duracion || 60;
            servicioNombre = turnoRes.rows[0].servicio_nombre || servicioNombre;
            servicioZona = turnoRes.rows[0].servicio_zona;
            servicioColor = turnoRes.rows[0].servicio_color || servicioColor;
            sucursalId = turnoRes.rows[0].sucursal_id;
          }
        }

        await query(
          `INSERT INTO turnos
           (user_id, nombre, telefono, servicio_nombre, servicio_zona, servicio_color,
            duracion, fecha, hora, notas, sucursal_id, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            req.user.id,
            nombre,
            telefono,
            servicioNombre,
            servicioZona,
            servicioColor,
            duracion,
            proxima_fecha,
            proxima_hora,
            `Próxima sesión programada desde ficha clínica${tratamiento ? ' — ' + tratamiento : ''}`,
            sucursalId,
            'activo'
          ]
        );
      }
    }

    res.json({ ok: true, sesion: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/sesion/:id', autenticar, async (req, res) => {
  const { tratamiento, parametros, observaciones, profesional } = req.body;
  try {
    await query(
      `UPDATE sesiones_clinicas SET tratamiento=$1, parametros=$2, observaciones=$3, profesional=$4 WHERE id=$5`,
      [tratamiento, parametros, observaciones, profesional, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════
// FOTO DE SERVICIO
// ════════════════════════════════════════════════

router.post('/servicio/:id/foto', autenticar, uploadServicio.single('foto'), async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, foto_url FROM servicios WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Sin permiso' });

    if (rows[0].foto_url) {
      const old = path.join(__dirname, '../../public', rows[0].foto_url);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    const url = `/fotosServicio/${req.file.filename}`;
    await query('UPDATE servicios SET foto_url=$1 WHERE id=$2', [url, req.params.id]);
    res.json({ ok: true, url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/servicio/:id/foto', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT foto_url FROM servicios WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Sin permiso' });

    if (rows[0].foto_url) {
      const filePath = path.join(__dirname, '../../public', rows[0].foto_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await query('UPDATE servicios SET foto_url=NULL WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;