'use strict';

const { query } = require('../config/db');

// ═══════════════════════════════════════════════════════════
//  QUERIES — DEPIMÓVIL PRO
//  Todas las queries filtran por user_id.
//  NUNCA exponer datos de otros usuarios.
// ═══════════════════════════════════════════════════════════

// ─── USUARIOS ────────────────────────────────────────────────
const Usuarios = {

  async buscarPorEmail(email) {
    const { rows } = await query(
      `SELECT id, email, password_hash, nombre, rol,
              plan, trial_inicio, trial_fin, activo, ultimo_login
       FROM usuarios
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    return rows[0] || null;
  },

  async buscarPorId(id) {
    const { rows } = await query(
      `SELECT id, email, nombre, rol, plan,
              trial_inicio, trial_fin, activo,
              nombre_negocio, telefono, creado_en
       FROM usuarios
       WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async crear({ email, passwordHash, nombre, rol, plan, trialInicio, trialFin, nombreNegocio, telefono }) {
    const { rows } = await query(
      `INSERT INTO usuarios
         (email, password_hash, nombre, rol, plan,
          trial_inicio, trial_fin, nombre_negocio, telefono)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, email, nombre, rol, plan,
                 trial_inicio, trial_fin, activo, creado_en`,
      [
        email.toLowerCase().trim(),
        passwordHash,
        nombre,
        rol           || 'cliente',
        plan          || 'trial',
        trialInicio   || null,
        trialFin      || null,
        nombreNegocio || null,
        telefono      || null,
      ]
    );
    return rows[0];
  },
    async buscarPorEmailSimple(email) {
    const { rows } = await query(
      `SELECT id, email FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  },

  async crearAutoRegistro({ nombre, email, passwordHash, telefono, codigo_pais }) {
    // Concatenar código de país al teléfono (formato del sistema)
    let telefonoCompleto = null;
    if (telefono) {
      const limpio = String(telefono).replace(/\D/g, '').replace(/^0+/, '');
      if (limpio) {
        const prefijo = (codigo_pais || '+598').replace(/\D/g, '');
        telefonoCompleto = `+${prefijo}${limpio}`;
      }
    }

    const { rows } = await query(
      `INSERT INTO usuarios
         (nombre, email, password_hash, telefono,
          plan, trial_inicio, trial_fin, activo, rol)
       VALUES ($1, $2, $3, $4, 'trial', NOW(), NOW() + INTERVAL '14 days', true, 'cliente')
       RETURNING id, nombre, email, plan, trial_fin, rol, activo`,
      [nombre, email.toLowerCase().trim(), passwordHash, telefonoCompleto]
    );
    return rows[0];
  },

  async actualizarUltimoLogin(id) {
    await query(
      `UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1`,
      [id]
    );
  },

  async listarTodos() {
    const { rows } = await query(
      `SELECT id, email, nombre, rol, plan,
              trial_inicio, trial_fin, activo,
              nombre_negocio, telefono, creado_en, ultimo_login
       FROM usuarios
       ORDER BY creado_en DESC`
    );
    return rows;
  },

  async toggleActivo(id, activo) {
    const { rows } = await query(
      `UPDATE usuarios SET activo = $1
       WHERE id = $2
       RETURNING id, email, activo`,
      [activo, id]
    );
    return rows[0] || null;
  },

async cambiarPlan(id, plan, trialFin = null) {
  const { rows } = await query(
    `UPDATE usuarios
     SET plan = $1::varchar,
         trial_inicio = CASE 
           WHEN $1::varchar = 'trial' THEN NOW() 
           ELSE trial_inicio 
         END,
         trial_fin = CASE 
           WHEN $1::varchar = 'trial' 
                THEN COALESCE($2::timestamptz, trial_fin)
           ELSE NULL
         END
     WHERE id = $3
     RETURNING id, email, plan, trial_inicio, trial_fin`,
    [plan, trialFin, id]
  );

  return rows[0] || null;
},

  async eliminar(id) {
    await query(`DELETE FROM usuarios WHERE id = $1`, [id]);
  },
};

// ─── TURNOS ──────────────────────────────────────────────────
const Turnos = {

  async listar(userId, filtros = {}) {
    let sql = `
      SELECT id, user_id, servicio_id,
             nombre, telefono,
             servicio_nombre, servicio_zona, servicio_color,
             duracion, fecha, hora, notas,
             cumple_dia, cumple_mes,
             estado, creado_en, editado_en
      FROM turnos
      WHERE user_id = $1
        AND estado != 'cancelado'
    `;
    const params = [userId];
    let idx = 2;

    if (filtros.fecha) {
      sql += ` AND fecha = $${idx}`;
      params.push(filtros.fecha);
      idx++;
    }

    if (filtros.mes && filtros.anio) {
      sql += ` AND EXTRACT(MONTH FROM fecha) = $${idx}
               AND EXTRACT(YEAR  FROM fecha) = $${idx + 1}`;
      params.push(filtros.mes, filtros.anio);
      idx += 2;
    }

    sql += ` ORDER BY fecha ASC, hora ASC`;

    const { rows } = await query(sql, params);
    return rows;
  },

  async buscarPorId(id, userId) {
    const { rows } = await query(
      `SELECT * FROM turnos
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async crear(userId, datos) {
    const {
      servicioId, nombre, telefono,
      servicioNombre, servicioZona, servicioColor,
      duracion, fecha, hora, notas,
      cumpleDia, cumpleMes,
    } = datos;

    const { rows } = await query(
      `INSERT INTO turnos
         (user_id, servicio_id, nombre, telefono,
          servicio_nombre, servicio_zona, servicio_color,
          duracion, fecha, hora, notas,
          cumple_dia, cumple_mes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
      ]
    );
    return rows[0];
  },

  async actualizar(id, userId, datos) {
    const {
      servicioId, nombre, telefono,
      servicioNombre, servicioZona, servicioColor,
      duracion, fecha, hora, notas,
      cumpleDia, cumpleMes, estado,
    } = datos;

    const { rows } = await query(
      `UPDATE turnos SET
         servicio_id     = COALESCE($1, servicio_id),
         nombre          = $2,
         telefono        = $3,
         servicio_nombre = $4,
         servicio_zona   = $5,
         servicio_color  = $6,
         duracion        = $7,
         fecha           = $8,
         hora            = $9,
         notas           = $10,
         cumple_dia      = $11,
         cumple_mes      = $12,
         estado          = COALESCE($13, estado),
         editado_en      = NOW()
       WHERE id = $14 AND user_id = $15
       RETURNING *`,
      [
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
        estado         || null,
        id,
        userId,
      ]
    );
    return rows[0] || null;
  },

  async eliminar(id, userId) {
    const { rowCount } = await query(
      `DELETE FROM turnos
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rowCount > 0;
  },

  async getCumples(userId) {
    const mesActual = new Date().getMonth() + 1;
    const { rows } = await query(
      `SELECT id, nombre, telefono, cumple_dia, cumple_mes
       FROM turnos
       WHERE user_id  = $1
         AND cumple_mes = $2
         AND estado   != 'cancelado'
       ORDER BY cumple_dia ASC`,
      [userId, mesActual]
    );
    return rows;
  },

  async verificarConflicto(userId, fecha, hora, duracion, excludeId = null) {
    let sql = `
      SELECT id, nombre, hora, duracion
      FROM turnos
      WHERE user_id = $1
        AND fecha   = $2
        AND estado != 'cancelado'
        AND (
          hora < ($3::time + ($4 || ' minutes')::interval)
          AND (hora + (duracion || ' minutes')::interval) > $3::time
        )
    `;
    const params = [userId, fecha, hora, duracion];

    if (excludeId) {
      sql += ` AND id != $5`;
      params.push(excludeId);
    }

    const { rows } = await query(sql, params);
    return rows;
  },
};

// ─── SERVICIOS ───────────────────────────────────────────────
const Sucursales = {

  async listar(userId) {
    const { rows } = await query(
      `SELECT id, user_id, nombre, horarios, max_turnos_hora, activo, created_at
       FROM sucursales
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  },

  async buscarPorId(id, userId) {
    const { rows } = await query(
      `SELECT id, user_id, nombre, horarios, max_turnos_hora, activo, created_at
       FROM sucursales
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async obtenerHorarios(id, userId) {
    const { rows } = await query(
      `SELECT id, nombre, horarios
       FROM sucursales
       WHERE id = $1 AND user_id = $2 AND activo = true`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async guardarHorarios(id, userId, horarios) {
    const { rows } = await query(
      `UPDATE sucursales
       SET horarios = $1::jsonb
       WHERE id = $2 AND user_id = $3
       RETURNING id, nombre, horarios`,
      [JSON.stringify(horarios || []), id, userId]
    );
    return rows[0] || null;
  },
};

const Servicios = {

  async listar(userId) {
    const { rows } = await query(
      `SELECT id, user_id, nombre, zona, duracion,
              color, descripcion, activo, creado_en,
              requiere_senia, monto_senia, precio,
              COALESCE(categoria, 'General') as categoria
       FROM servicios
       WHERE user_id = $1
         AND activo  = true
       ORDER BY categoria ASC, nombre ASC`,
      [userId]
    );
    return rows;
  },

  async buscarPorId(id, userId) {
    const { rows } = await query(
      `SELECT * FROM servicios
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async crear(userId, datos) {
    const {
      nombre,
      zona,
      duracion,
      color,
      descripcion,
      categoria,
      requiereSenia,
      montoSenia,
      precio,
    } = datos;

    const { rows } = await query(
      `INSERT INTO servicios
         (user_id, nombre, precio, zona, duracion,
          color, descripcion, categoria,
          requiere_senia, monto_senia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        userId,
        nombre,
        precio        || 0,
          zona          || 'Sin zona',
        duracion,
        color         || '#A85568',
        descripcion   || null,
        categoria?.trim() || 'General',
        requiereSenia || false,
        montoSenia    || 0,
      ]
    );
    return rows[0];
  },

  async actualizar(id, userId, datos) {
    const {
      nombre,
      zona,
      duracion,
      color,
      descripcion,
      categoria,
      requiereSenia,
      montoSenia,
      precio,
    } = datos;

    const { rows } = await query(
      `UPDATE servicios SET
         nombre         = $1,
         zona           = $2,
         duracion       = $3,
         color          = $4,
         descripcion    = $5,
         categoria      = $6,
         requiere_senia = $7,
         monto_senia    = $8,
         precio         = $9,
         editado_en     = NOW()
       WHERE id = $10
         AND user_id = $11
       RETURNING *`,
      [
        nombre,
          zona          || 'Sin zona',
        duracion,
        color         || '#A85568',
        descripcion   || null,
        categoria?.trim() || 'General',
        requiereSenia || false,
        montoSenia    || 0,
        precio        || 0,
        id,
        userId,
      ]
    );
    return rows[0] || null;
  },

  async eliminar(id, userId) {
    const { rowCount } = await query(
      `DELETE FROM servicios
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rowCount > 0;
  },
};

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const Configuracion = {

  async get(userId) {
    const { rows } = await query(
      `SELECT id, user_id, plantilla_turno, plantilla_cumple, creado_en
       FROM configuracion
       WHERE user_id = $1`,
      [userId]
    );
    return rows[0] || null;
  },

  async guardar(userId, datos) {
    const { plantillaTurno, plantillaCumple } = datos;
    const { rows } = await query(
      `INSERT INTO configuracion (user_id, plantilla_turno, plantilla_cumple)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         plantilla_turno  = EXCLUDED.plantilla_turno,
         plantilla_cumple = EXCLUDED.plantilla_cumple,
         editado_en       = NOW()
       RETURNING *`,
      [userId, plantillaTurno, plantillaCumple]
    );
    return rows[0];
  },
};

// ─── INVITACIONES ────────────────────────────────────────────
const Invitaciones = {

  async crear({ token, email, plan, diasTrial, creadoPor }) {
    const { rows } = await query(
      `INSERT INTO invitaciones
         (token, email, plan, dias_trial, creado_por, expira_en)
       VALUES ($1,$2,$3,$4,$5, NOW() + INTERVAL '7 days')
       RETURNING *`,
      [token, email.toLowerCase().trim(), plan, diasTrial, creadoPor]
    );
    return rows[0];
  },

  async buscarPorToken(token) {
    const { rows } = await query(
      `SELECT * FROM invitaciones
       WHERE token     = $1
         AND usado     = false
         AND expira_en > NOW()`,
      [token]
    );
    return rows[0] || null;
  },

  async marcarUsada(id, usadoPor) {
    await query(
      `UPDATE invitaciones
       SET usado    = true,
           usado_en = NOW()
       WHERE id = $1`,
      [id]
    );
  },

  async listar(adminId) {
    const { rows } = await query(
      `SELECT i.*, u.nombre as nombre_usuario
       FROM invitaciones i
       LEFT JOIN usuarios u ON u.id = i.creado_por
       WHERE i.creado_por = $1
       ORDER BY i.creado_en DESC`,
      [adminId]
    );
    return rows;
  },
};

// ─── LOGIN INTENTOS ──────────────────────────────────────────
const LoginIntentos = {

  async registrar(email, ip, exitoso) {
    await query(
      `INSERT INTO login_intentos (email, ip, exitoso)
       VALUES ($1, $2, $3)`,
      [email.toLowerCase().trim(), ip, exitoso]
    );
  },

  async contarFallidos(email, ip, minutos = 15) {
    const { rows } = await query(
      `SELECT COUNT(*) as total
       FROM login_intentos
       WHERE email    = $1
         AND ip       = $2
         AND exitoso  = false
         AND creado_en > NOW() - ($3 || ' minutes')::interval`,
      [email.toLowerCase().trim(), ip, minutos]
    );
    return parseInt(rows[0].total);
  },

  async limpiarViejos() {
    await query(
      `DELETE FROM login_intentos
       WHERE creado_en < NOW() - INTERVAL '1 hour'`
    );
  },
};

// Agregar al objeto de queries
const crearUsuarioAutoRegistro = async ({ nombre, email, passwordHash, telefono, codigo_pais }) => {
  // Concatenar código de país al teléfono (formato usado en el resto del sistema)
  let telefonoCompleto = null;
  if (telefono) {
    const limpio = String(telefono).replace(/\D/g, '').replace(/^0+/, '');
    if (limpio) {
      const prefijo = (codigo_pais || '+598').replace(/\D/g, '');
      telefonoCompleto = `+${prefijo}${limpio}`;
    }
  }

  const result = await pool.query(
    `INSERT INTO usuarios
       (nombre, email, password_hash, telefono, plan, trial_inicio, trial_fin, activo, rol, creado_en)
     VALUES ($1, $2, $3, $4, 'trial', NOW(), NOW() + INTERVAL '14 days', true, 'cliente', NOW())
     RETURNING id, nombre, email, plan, trial_fin, rol`,
    [nombre, email, passwordHash, telefonoCompleto]
  );
  return result.rows[0];
};

const buscarUsuarioPorEmail = async (email) => {
  const result = await pool.query(
    `SELECT id, email FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  return result.rows[0];
};
// ─── WA PENDIENTES ───────────────────────────────────────
const WaPendientes = {
  async crear({ userId, turnoId, tipo, nombre, telefono, mensaje, fechaEvento }) {
    // Evitar duplicados: si ya existe uno igual no enviado, no crear otro
    if (turnoId) {
      const { rows: existe } = await query(
        `SELECT id FROM wa_pendientes
         WHERE user_id = $1 AND turno_id = $2 AND tipo = $3 AND enviado = FALSE
         LIMIT 1`,
        [userId, turnoId, tipo]
      );
      if (existe.length > 0) return existe[0];
    }

    const { rows } = await query(
      `INSERT INTO wa_pendientes
         (user_id, turno_id, tipo, destinatario_nombre,
          destinatario_telefono, mensaje, fecha_evento)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, turnoId || null, tipo, nombre || null,
       telefono || null, mensaje, fechaEvento || null]
    );
    return rows[0];
  },

  async listar(userId, { soloPendientes = true, limit = 50 } = {}) {
    const whereEnviado = soloPendientes ? 'AND enviado = FALSE' : '';
    const { rows } = await query(
      `SELECT id, turno_id, tipo, destinatario_nombre,
              destinatario_telefono, mensaje, fecha_evento,
              enviado, enviado_en, creado_en
       FROM wa_pendientes
       WHERE user_id = $1 ${whereEnviado}
       ORDER BY creado_en DESC
       LIMIT $2`,
      [userId, limit]
    );
    return rows;
  },

  async contarPendientes(userId) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM wa_pendientes
       WHERE user_id = $1 AND enviado = FALSE`,
      [userId]
    );
    return rows[0]?.total || 0;
  },

  async marcarEnviado(id, userId) {
    const { rows } = await query(
      `UPDATE wa_pendientes
       SET enviado = TRUE, enviado_en = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async eliminar(id, userId) {
    await query(
      `DELETE FROM wa_pendientes WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return true;
  },
};
module.exports = {
  Usuarios,
  Turnos,
  Servicios,
  Configuracion,
  Invitaciones,
  LoginIntentos,
  crearUsuarioAutoRegistro,
  buscarUsuarioPorEmail,
  WaPendientes,
  Sucursales
};
