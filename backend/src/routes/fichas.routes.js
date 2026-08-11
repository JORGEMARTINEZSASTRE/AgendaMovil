'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const { query }    = require('../config/db');
const { autenticar } = require('../middleware/auth');
const { subirImagen, eliminarImagen } = require('../services/cloudinary');

// ── Multer: storage temporal ──────────────────────────
const storageTemp = (subfolder) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = os.tmpdir();
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${subfolder}_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const uploadSesion = multer({
  storage: storageTemp('sesion'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

const uploadServicio = multer({
  storage: storageTemp('servicio'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

// ════════════════════════════════════════════════
// FICHAS CLÍNICAS
// ════════════════════════════════════════════════

/**
 * Números de la clienta que no hay que cargar a mano: salen de sus
 * turnos y de las sesiones ya registradas.
 *
 * - dias_concurridos cuenta FECHAS distintas, no turnos: si vino un día
 *   y se hizo axilas y piernas en dos turnos seguidos, concurrió una vez.
 * - sesiones_hechas son los turnos que ya pasaron y no se cancelaron.
 *   Los que están agendados para adelante se cuentan aparte: todavía no
 *   se hicieron.
 */
async function resumenDeLaClienta(userId, telefono, fichaId) {
  const vacio = {
    sesiones_hechas: 0, turnos_futuros: 0, dias_concurridos: 0,
    primera_visita: null, ultima_visita: null,
    cancelados: 0, sesiones_registradas: 0,
  };

  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE estado != 'cancelado' AND fecha <= CURRENT_DATE)::int AS sesiones_hechas,
         COUNT(*) FILTER (WHERE estado != 'cancelado' AND fecha >  CURRENT_DATE)::int AS turnos_futuros,
         COUNT(DISTINCT fecha) FILTER (WHERE estado != 'cancelado' AND fecha <= CURRENT_DATE)::int AS dias_concurridos,
         COUNT(*) FILTER (WHERE estado  = 'cancelado')::int AS cancelados,
         MIN(fecha) FILTER (WHERE estado != 'cancelado' AND fecha <= CURRENT_DATE) AS primera_visita,
         MAX(fecha) FILTER (WHERE estado != 'cancelado' AND fecha <= CURRENT_DATE) AS ultima_visita
       FROM turnos
       WHERE user_id = $1 AND telefono = $2`,
      [userId, telefono]
    );

    const r = { ...vacio, ...(rows[0] || {}) };

    if (fichaId) {
      const s = await query(
        'SELECT COUNT(*)::int AS total FROM sesiones_clinicas WHERE ficha_id = $1',
        [fichaId]
      );
      r.sesiones_registradas = s.rows[0]?.total || 0;
    }
    return r;
  } catch (e) {
    // El resumen es informativo: si falla, la ficha tiene que abrir igual.
    console.error('[FICHAS/resumen]', e.message);
    return vacio;
  }
}

router.get('/ficha/:telefono', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM fichas_clinicas WHERE user_id=$1 AND telefono=$2',
      [req.user.id, req.params.telefono]
    );
    // El resumen se arma aunque todavía no exista la ficha: son datos de
    // sus turnos, y sirven para decidir si vale la pena abrirle una.
    const resumen = await resumenDeLaClienta(req.user.id, req.params.telefono, rows[0]?.id);

    if (!rows.length) return res.json({ ficha: null, sesiones: [], resumen });

    const sesiones = await query(
      `SELECT sc.*, t.fecha as turno_fecha, t.hora as turno_hora, t.servicio_nombre
       FROM sesiones_clinicas sc
       LEFT JOIN turnos t ON t.id = sc.turno_id
       WHERE sc.ficha_id=$1
       ORDER BY sc.fecha DESC, sc.creado_en DESC`,
      [rows[0].id]
    );
    res.json({ ficha: rows[0], sesiones: sesiones.rows, resumen });
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
    'peso','altura',
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

    // Subir fotos a Cloudinary
    let fotos = [];
    if (req.files && req.files.length) {
      const uploads = req.files.map(f => subirImagen(f.path, 'fichas'));
      fotos = await Promise.all(uploads);
      // Limpiar archivos temporales
      req.files.forEach(f => fs.unlinkSync(f.path));
    }

    const { rows } = await query(
      `INSERT INTO sesiones_clinicas (ficha_id, turno_id, fecha, tratamiento, parametros, observaciones, profesional, fotos)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7) RETURNING *`,
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

    // Eliminar foto anterior en Cloudinary
    if (rows[0].foto_url) {
      await eliminarImagen(rows[0].foto_url);
    }

    // Subir nueva foto
    const url = await subirImagen(req.file.path, 'servicios');
    fs.unlinkSync(req.file.path);

    await query('UPDATE servicios SET foto_url=$1 WHERE id=$2', [url, req.params.id]);
    res.json({ ok: true, url });
  } catch (e) {
    console.error(e);
    // Limpiar archivo temporal en caso de error
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
      await eliminarImagen(rows[0].foto_url);
    }
    await query('UPDATE servicios SET foto_url=NULL WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;