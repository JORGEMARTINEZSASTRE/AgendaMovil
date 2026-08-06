'use strict';

const { query, getClient } = require('../config/db');

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
              nombre_negocio, telefono, logo_url, creado_en
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
      SELECT t.id, t.user_id, t.servicio_id,
             t.nombre, t.telefono,
             t.servicio_nombre, t.servicio_zona, t.servicio_color,
             t.duracion, t.fecha, t.hora, t.notas,
             t.cumple_dia, t.cumple_mes,
             t.estado, t.creado_en, t.editado_en,
             t.sucursal_id,
             t.profesional_id,
             t.profesional_nombre,
             t.senia_requerida, t.senia_pagada, t.monto_senia, t.estado_pago,
             s.nombre AS sucursal_nombre,
             s.tipo   AS sucursal_tipo
      FROM turnos t
      LEFT JOIN sucursales s ON s.id = t.sucursal_id
      WHERE t.user_id = $1
        AND t.estado != 'cancelado'
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
      `SELECT t.*,
              s.nombre AS sucursal_nombre,
              s.tipo   AS sucursal_tipo
       FROM turnos t
       LEFT JOIN sucursales s ON s.id = t.sucursal_id
       WHERE t.id = $1 AND t.user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async crear(userId, datos) {
    const {
      servicioId, nombre, telefono,
      servicioNombre, servicioZona, servicioColor,
      duracion, fecha, hora, notas,
      cumpleDia, cumpleMes, sucursalId,
      profesionalId, profesionalNombre,
    } = datos;

    const { rows } = await query(
      `INSERT INTO turnos
         (user_id, servicio_id, nombre, telefono,
          servicio_nombre, servicio_zona, servicio_color,
          duracion, fecha, hora, notas,
          cumple_dia, cumple_mes, sucursal_id,
          profesional_id, profesional_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        userId,
        servicioId         || null,
        nombre,
        telefono,
        servicioNombre     || null,
        servicioZona       || null,
        servicioColor      || '#A85568',
        duracion,
        fecha,
        hora,
        notas              || null,
        cumpleDia          || null,
        cumpleMes          || null,
        sucursalId         || null,
        profesionalId      || null,
        profesionalNombre  || null,
      ]
    );
    return rows[0];
  },

  async actualizar(id, userId, datos) {
    const {
      servicioId, nombre, telefono,
      servicioNombre, servicioZona, servicioColor,
      duracion, fecha, hora, notas,
      cumpleDia, cumpleMes, estado, sucursalId,
      profesionalId, profesionalNombre,
    } = datos;

    const { rows } = await query(
      `UPDATE turnos SET
         servicio_id        = COALESCE($1, servicio_id),
         nombre             = $2,
         telefono           = $3,
         servicio_nombre    = $4,
         servicio_zona      = $5,
         servicio_color     = $6,
         duracion           = $7,
         fecha              = $8,
         hora               = $9,
         notas              = $10,
         cumple_dia         = $11,
         cumple_mes         = $12,
         estado             = COALESCE($13, estado),
         sucursal_id        = COALESCE($14, sucursal_id),
         profesional_id     = $15,
         profesional_nombre = $16,
         editado_en         = NOW()
       WHERE id = $17 AND user_id = $18
       RETURNING *`,
      [
        servicioId         || null,
        nombre,
        telefono,
        servicioNombre     || null,
        servicioZona       || null,
        servicioColor      || '#A85568',
        duracion,
        fecha,
        hora,
        notas              || null,
        cumpleDia          || null,
        cumpleMes          || null,
        estado             || null,
        sucursalId         || null,
        profesionalId      || null,
        profesionalNombre  || null,
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

  async verificarConflictoPorSucursal(userId, sucursalId, fecha, hora, duracion, excludeId = null) {
    let sql = `
      SELECT id, nombre, hora, duracion
      FROM turnos
      WHERE user_id = $1
        AND sucursal_id = $2
        AND fecha = $3
        AND estado != 'cancelado'
        AND (
          hora < ($4::time + ($5 || ' minutes')::interval)
          AND (hora + (duracion || ' minutes')::interval) > $4::time
        )
    `;
    const params = [userId, sucursalId, fecha, hora, duracion];

    if (excludeId) {
      sql += ` AND id != $6`;
      params.push(excludeId);
    }

    const { rows } = await query(sql, params);
    return rows;
  },
};

// ─── SERVICIOS ───────────────────────────────────────────────
const Sucursales = {

  async crear(userId, { nombre, tipo = 'sucursal', maxTurnosHora = 1 }) {
    const { rows } = await query(
      `INSERT INTO sucursales (user_id, nombre, tipo, horarios, max_turnos_hora, activo)
       VALUES ($1, $2, $3, '[]'::jsonb, $4, true)
       RETURNING id, user_id, nombre, tipo, horarios, max_turnos_hora, activo, created_at`,
      [userId, nombre, tipo, maxTurnosHora]
    );
    return rows[0];
  },

  async listar(userId) {
    const { rows } = await query(
      `SELECT id, user_id, nombre, tipo, horarios, max_turnos_hora, activo, created_at
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
              requiere_senia, monto_senia,
              COALESCE(senia_tipo, 'monto') AS senia_tipo,
              COALESCE(senia_porcentaje, 0) AS senia_porcentaje,
              precio,
              COALESCE(categoria, 'General') as categoria,
              foto_url, sucursal_ids
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
      seniaTipo,
      seniaPorcentaje,
      precio,
      sucursalIds,
    } = datos;

    const { rows } = await query(
      `INSERT INTO servicios
         (user_id, nombre, precio, zona, duracion,
          color, descripcion, categoria,
          requiere_senia, monto_senia, senia_tipo, senia_porcentaje,
          sucursal_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
        seniaTipo === 'porcentaje' ? 'porcentaje' : 'monto',
        seniaPorcentaje || 0,
        sucursalIds   || [],
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
      seniaTipo,
      seniaPorcentaje,
      precio,
      sucursalIds,
    } = datos;

    const { rows } = await query(
      `UPDATE servicios SET
         nombre           = $1,
         zona             = $2,
         duracion         = $3,
         color            = $4,
         descripcion      = $5,
         categoria        = $6,
         requiere_senia   = $7,
         monto_senia      = $8,
         senia_tipo       = $9,
         senia_porcentaje = $10,
         precio           = $11,
         sucursal_ids     = $12,
         editado_en       = NOW()
       WHERE id = $13
         AND user_id = $14
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
        seniaTipo === 'porcentaje' ? 'porcentaje' : 'monto',
        seniaPorcentaje || 0,
        precio        || 0,
        sucursalIds   || [],
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

// ═══════════════════════════════════════════════════════════
//  CUPONERAS — paquetes de sesiones prepagas
//  Las sesiones usadas se cuentan por filas en cuponera_usos,
//  nunca con un contador: así no se puede desincronizar.
// ═══════════════════════════════════════════════════════════
const MAX_SESIONES_CUPONERA = 12;

const Cuponeras = {
  MAX: MAX_SESIONES_CUPONERA,

  async listar(userId, { incluirCerradas = false } = {}) {
    const { rows } = await query(
      `SELECT c.*,
              COALESCE(u.usadas, 0)                        AS usadas,
              c.total_sesiones - COALESCE(u.usadas, 0)     AS restantes,
              u.ultimo_uso
         FROM cuponeras c
         LEFT JOIN (
           SELECT cuponera_id, COUNT(*)::int AS usadas, MAX(fecha) AS ultimo_uso
             FROM cuponera_usos
            GROUP BY cuponera_id
         ) u ON u.cuponera_id = c.id
        WHERE c.user_id = $1
          ${incluirCerradas ? '' : 'AND c.activa = TRUE'}
        ORDER BY c.activa DESC, c.creada_en DESC`,
      [userId]
    );
    return rows;
  },

  async buscarPorId(id, userId) {
    const { rows } = await query(
      `SELECT c.*,
              COALESCE(u.usadas, 0)                    AS usadas,
              c.total_sesiones - COALESCE(u.usadas, 0) AS restantes
         FROM cuponeras c
         LEFT JOIN (
           SELECT cuponera_id, COUNT(*)::int AS usadas
             FROM cuponera_usos GROUP BY cuponera_id
         ) u ON u.cuponera_id = c.id
        WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async crear(userId, datos) {
    const {
      clienteNombre, clienteTelefono, servicioId, servicioNombre,
      totalSesiones, precioTotal, notas,
    } = datos;

    const { rows } = await query(
      `INSERT INTO cuponeras
         (user_id, cliente_nombre, cliente_telefono,
          servicio_id, servicio_nombre, total_sesiones, precio_total, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        userId, clienteNombre, clienteTelefono,
        servicioId || null, servicioNombre || null,
        totalSesiones, precioTotal || 0, notas || null,
      ]
    );
    return rows[0];
  },

  /** Historial de sesiones consumidas, de la más nueva a la más vieja. */
  async usos(cuponeraId) {
    const { rows } = await query(
      `SELECT id, fecha, nota, turno_id, creado_en
         FROM cuponera_usos
        WHERE cuponera_id = $1
        ORDER BY fecha DESC, creado_en DESC`,
      [cuponeraId]
    );
    return rows;
  },

  /**
   * Registra una sesión usada. Devuelve null si ya no quedan, para que
   * la ruta pueda avisar en vez de dejar la cuponera en negativo.
   * La cuponera se cierra sola cuando se consume la última.
   */
  async registrarUso(cuponeraId, userId, { fecha, nota, turnoId } = {}) {
    const cuponera = await this.buscarPorId(cuponeraId, userId);
    if (!cuponera) return { error: 'no_encontrada' };
    if (!cuponera.activa) return { error: 'cerrada' };
    if (cuponera.restantes <= 0) return { error: 'sin_sesiones' };

    const { rows } = await query(
      `INSERT INTO cuponera_usos (cuponera_id, turno_id, fecha, nota)
       VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4)
       RETURNING *`,
      [cuponeraId, turnoId || null, fecha || null, nota || null]
    );

    // ¿Era la última? Se cierra sola.
    if (cuponera.restantes === 1) {
      await query(
        `UPDATE cuponeras SET activa = FALSE, cerrada_en = NOW() WHERE id = $1`,
        [cuponeraId]
      );
    }

    return { uso: rows[0] };
  },

  /** Deshace una sesión cargada por error y reabre la cuponera si hacía falta. */
  async borrarUso(usoId, cuponeraId, userId) {
    const cuponera = await this.buscarPorId(cuponeraId, userId);
    if (!cuponera) return false;

    const { rowCount } = await query(
      `DELETE FROM cuponera_usos WHERE id = $1 AND cuponera_id = $2`,
      [usoId, cuponeraId]
    );
    if (!rowCount) return false;

    await query(
      `UPDATE cuponeras SET activa = TRUE, cerrada_en = NULL WHERE id = $1`,
      [cuponeraId]
    );
    return true;
  },

  async cerrar(id, userId) {
    const { rows } = await query(
      `UPDATE cuponeras
          SET activa = FALSE, cerrada_en = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  },
};

// ═══════════════════════════════════════════════════════════
//  FOTOS DE SERVICIOS (vitrina)
//  servicios.foto_url sigue siendo la portada; acá viven todas.
// ═══════════════════════════════════════════════════════════
const MAX_FOTOS_POR_SERVICIO = 8;

const ServicioFotos = {
  MAX: MAX_FOTOS_POR_SERVICIO,

  async listar(servicioId) {
    const { rows } = await query(
      `SELECT id, url, orden
         FROM servicio_fotos
        WHERE servicio_id = $1
        ORDER BY orden ASC, creado_en ASC`,
      [servicioId]
    );
    return rows;
  },

  /** Trae las fotos de varios servicios de una, agrupadas por servicio_id. */
  async listarDeServicios(servicioIds) {
    if (!servicioIds || !servicioIds.length) return {};
    const { rows } = await query(
      `SELECT servicio_id, id, url, orden
         FROM servicio_fotos
        WHERE servicio_id = ANY($1::uuid[])
        ORDER BY orden ASC, creado_en ASC`,
      [servicioIds]
    );
    const porServicio = {};
    for (const r of rows) {
      (porServicio[r.servicio_id] ||= []).push({ id: r.id, url: r.url, orden: r.orden });
    }
    return porServicio;
  },

  async contar(servicioId) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total FROM servicio_fotos WHERE servicio_id = $1`,
      [servicioId]
    );
    return rows[0].total;
  },

  async agregar(servicioId, url) {
    const { rows } = await query(
      `INSERT INTO servicio_fotos (servicio_id, url, orden)
       VALUES ($1, $2, COALESCE(
         (SELECT MAX(orden) + 1 FROM servicio_fotos WHERE servicio_id = $1), 0
       ))
       RETURNING id, url, orden`,
      [servicioId, url]
    );
    return rows[0];
  },

  /** Borra una foto y devuelve su url, para poder limpiarla en Cloudinary. */
  async eliminar(fotoId, servicioId) {
    const { rows } = await query(
      `DELETE FROM servicio_fotos
        WHERE id = $1 AND servicio_id = $2
        RETURNING url`,
      [fotoId, servicioId]
    );
    return rows[0]?.url || null;
  },

  /**
   * Deja servicios.foto_url apuntando a la primera foto de la galería.
   * Así todo lo que ya lee foto_url (agenda pública, panel) sigue andando.
   */
  async sincronizarPortada(servicioId) {
    const { rows } = await query(
      `UPDATE servicios
          SET foto_url = (
            SELECT url FROM servicio_fotos
             WHERE servicio_id = $1
             ORDER BY orden ASC, creado_en ASC
             LIMIT 1
          )
        WHERE id = $1
        RETURNING foto_url`,
      [servicioId]
    );
    return rows[0]?.foto_url || null;
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

// ─── CLIENTES ─────────────────────────────────────────────────
const Clientes = {
  async listar(userId) {
    const { rows } = await query(
      `SELECT
         t.telefono,
         MAX(t.nombre)          AS nombre,
         COUNT(*)               AS total_turnos,
         COALESCE(SUM(s.precio), 0) AS total_gastado,
         MAX(t.fecha)           AS ultimo_turno,
         MAX(t.creado_en)       AS primera_vez
       FROM turnos t
       LEFT JOIN servicios s ON s.id = t.servicio_id
       WHERE t.user_id = $1 AND t.estado != 'cancelado'
       GROUP BY t.telefono
       ORDER BY total_gastado DESC NULLS LAST`,
      [userId]
    );
    return rows;
  },

  async historial(userId, telefono) {
    const { rows } = await query(
      `SELECT t.*, s.precio as servicio_precio
       FROM turnos t
       LEFT JOIN servicios s ON s.id = t.servicio_id
       WHERE t.user_id = $1 AND t.telefono = $2
       ORDER BY t.fecha DESC, t.hora DESC`,
      [userId, telefono]
    );
    return rows;
  },

  /**
   * Clientas sin turnos en los últimos N meses, más las cargadas a mano
   * que nunca tuvieron uno. Devuelve lo que se perdería al borrarlas
   * para poder mostrárselo a la operadora ANTES de que confirme.
   */
  async inactivos(userId, meses = 6) {
    const { rows } = await query(
      `WITH desde_turnos AS (
         SELECT t.telefono,
                MAX(t.nombre)              AS nombre,
                COUNT(*)                   AS total_turnos,
                COALESCE(SUM(s.precio), 0) AS total_gastado,
                MAX(t.fecha)               AS ultimo_turno
           FROM turnos t
           LEFT JOIN servicios s ON s.id = t.servicio_id
          WHERE t.user_id = $1 AND t.estado != 'cancelado'
          GROUP BY t.telefono
       )
       SELECT COALESCE(d.telefono, c.telefono)   AS telefono,
              COALESCE(d.nombre, c.nombre)       AS nombre,
              COALESCE(d.total_turnos, 0)        AS total_turnos,
              COALESCE(d.total_gastado, 0)       AS total_gastado,
              d.ultimo_turno,
              COALESCE(c.favorito, false)        AS favorito
         FROM desde_turnos d
         FULL OUTER JOIN clientes c
           ON c.user_id = $1 AND c.telefono = d.telefono
        WHERE COALESCE(d.ultimo_turno, DATE '1900-01-01')
              < (CURRENT_DATE - make_interval(months => $2::int))
        ORDER BY d.ultimo_turno ASC NULLS FIRST`,
      [userId, meses]
    );
    return rows;
  },

  /**
   * Borra clientas y TODOS sus turnos, en una transacción.
   * Es destructivo y no tiene vuelta atrás: los ingresos de los meses
   * en que se las atendió bajan. Solo se llama con una lista explícita
   * de teléfonos que la operadora ya confirmó.
   */
  async eliminarPorTelefonos(userId, telefonos) {
    if (!telefonos?.length) return { turnos: 0, clientes: 0 };

    const cliente = await getClient();
    try {
      await cliente.query('BEGIN');

      const t = await cliente.query(
        `DELETE FROM turnos WHERE user_id = $1 AND telefono = ANY($2::text[])`,
        [userId, telefonos]
      );
      const c = await cliente.query(
        `DELETE FROM clientes WHERE user_id = $1 AND telefono = ANY($2::text[])`,
        [userId, telefonos]
      );

      await cliente.query('COMMIT');
      return { turnos: t.rowCount, clientes: c.rowCount };
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }
  },

  async resumen(userId) {
    const { rows } = await query(`
      WITH
      semana_actual AS (
        SELECT COALESCE(SUM(s.precio), 0) AS ganancia, COUNT(*) AS turnos
        FROM turnos t
        LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.user_id = $1 AND t.estado != 'cancelado'
          AND t.fecha >= date_trunc('week', CURRENT_DATE)
          AND t.fecha <  date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
      ),
      semana_anterior AS (
        SELECT COALESCE(SUM(s.precio), 0) AS ganancia, COUNT(*) AS turnos
        FROM turnos t
        LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.user_id = $1 AND t.estado != 'cancelado'
          AND t.fecha >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days'
          AND t.fecha <  date_trunc('week', CURRENT_DATE)
      ),
      mes_actual AS (
        SELECT COALESCE(SUM(s.precio), 0) AS ganancia, COUNT(*) AS turnos
        FROM turnos t
        LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.user_id = $1 AND t.estado != 'cancelado'
          AND t.fecha >= date_trunc('month', CURRENT_DATE)
          AND t.fecha <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      ),
      mes_anterior AS (
        SELECT COALESCE(SUM(s.precio), 0) AS ganancia, COUNT(*) AS turnos
        FROM turnos t
        LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.user_id = $1 AND t.estado != 'cancelado'
          AND t.fecha >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
          AND t.fecha <  date_trunc('month', CURRENT_DATE)
      ),
      top_servicios AS (
        SELECT t.servicio_nombre AS nombre,
               COUNT(*) AS cantidad,
               COALESCE(SUM(s.precio), 0) AS total
        FROM turnos t
        LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.user_id = $1 AND t.estado != 'cancelado'
          AND t.servicio_nombre IS NOT NULL
          AND t.fecha >= date_trunc('month', CURRENT_DATE)
        GROUP BY t.servicio_nombre
        ORDER BY cantidad DESC
        LIMIT 3
      ),
      clienta_mes AS (
        SELECT t.nombre, t.telefono, COUNT(*) AS visitas
        FROM turnos t
        WHERE t.user_id = $1 AND t.estado != 'cancelado'
          AND t.fecha >= date_trunc('month', CURRENT_DATE)
        GROUP BY t.nombre, t.telefono
        ORDER BY visitas DESC
        LIMIT 1
      )
      SELECT
        (SELECT ganancia FROM semana_actual)  AS semana_ganancia,
        (SELECT turnos   FROM semana_actual)  AS semana_turnos,
        (SELECT ganancia FROM semana_anterior)AS semana_ant_ganancia,
        (SELECT ganancia FROM mes_actual)     AS mes_ganancia,
        (SELECT turnos   FROM mes_actual)     AS mes_turnos,
        (SELECT ganancia FROM mes_anterior)   AS mes_ant_ganancia,
        (SELECT JSON_AGG(t) FROM top_servicios t) AS top_servicios,
        (SELECT JSON_AGG(c) FROM clienta_mes c)   AS clienta_mes
    `, [userId]);
    return rows[0];
  },
};

// ─── PROFESIONALES ────────────────────────────────────────────
const Profesionales = {
  async listar(userId) {
    const { rows } = await query(
      `SELECT * FROM profesionales
       WHERE user_id = $1 AND activo = true
       ORDER BY nombre ASC`,
      [userId]
    );
    return rows;
  },

  async buscarPorId(id, userId) {
    const { rows } = await query(
      `SELECT * FROM profesionales WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async crear(userId, { nombre, telefono, color }) {
    const { rows } = await query(
      `INSERT INTO profesionales (user_id, nombre, telefono, color)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, nombre, telefono || null, color || '#A85568']
    );
    return rows[0];
  },

  async actualizar(id, userId, { nombre, telefono, color }) {
    const { rows } = await query(
      `UPDATE profesionales
       SET nombre = $1, telefono = $2, color = $3
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [nombre, telefono || null, color || '#A85568', id, userId]
    );
    return rows[0] || null;
  },

  async eliminar(id, userId) {
    await query(
      `UPDATE profesionales SET activo = false WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return true;
  },
};

// ─── HORARIOS PROFESIONAL ─────────────────────────────────────────────────────
const HorariosProfesional = {
  // Trae todos los bloques semanales de un profesional
  async listar(profesionalId) {
    const { rows } = await query(
      `SELECT * FROM horarios_profesional
       WHERE profesional_id = $1
       ORDER BY dia_semana ASC`,
      [profesionalId]
    );
    return rows;
  },

  // Reemplaza todos los bloques semanales de una vez (upsert masivo)
  async guardar(profesionalId, bloques) {
    // bloques = [{ dia_semana, hora_inicio, hora_fin }, ...]
    await query(
      `DELETE FROM horarios_profesional WHERE profesional_id = $1`,
      [profesionalId]
    );
    if (!bloques || bloques.length === 0) return [];
    const values = bloques.map((b, i) =>
      `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
    ).join(', ');
    const params = bloques.flatMap(b => [
      profesionalId, b.dia_semana, b.hora_inicio, b.hora_fin
    ]);
    const { rows } = await query(
      `INSERT INTO horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin)
       VALUES ${values} RETURNING *`,
      params
    );
    return rows;
  },
};

// ─── BLOQUEOS PROFESIONAL ─────────────────────────────────────────────────────
const BloqueosProfesional = {
  async listar(profesionalId) {
    const { rows } = await query(
      `SELECT * FROM bloqueos_profesional
       WHERE profesional_id = $1
       ORDER BY fecha ASC`,
      [profesionalId]
    );
    return rows;
  },

  async agregar(profesionalId, fecha, motivo) {
    const { rows } = await query(
      `INSERT INTO bloqueos_profesional (profesional_id, fecha, motivo)
       VALUES ($1, $2, $3)
       ON CONFLICT (profesional_id, fecha) DO UPDATE SET motivo = EXCLUDED.motivo
       RETURNING *`,
      [profesionalId, fecha, motivo || null]
    );
    return rows[0];
  },

  async eliminar(id, profesionalId) {
    await query(
      `DELETE FROM bloqueos_profesional WHERE id = $1 AND profesional_id = $2`,
      [id, profesionalId]
    );
    return true;
  },
};

// ─── CLIENTES (tabla manual) ──────────────────────────────────────────
const ClientesManual = {
  async listar(userId) {
    const { rows } = await query(
      `SELECT c.*,
         COALESCE(SUM(s.precio), 0) AS total_gastado,
         COUNT(t.id)                AS total_turnos,
         MAX(t.fecha)               AS ultimo_turno
       FROM clientes c
       LEFT JOIN turnos t ON t.user_id = c.user_id AND t.telefono = c.telefono AND t.estado != 'cancelado'
       LEFT JOIN servicios s ON s.id = t.servicio_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.nombre ASC`,
      [userId]
    );
    return rows;
  },

  async crear(userId, { nombre, telefono }) {
    const { rows } = await query(
      `INSERT INTO clientes (user_id, nombre, telefono)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, telefono) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING *`,
      [userId, nombre, telefono]
    );
    return rows[0];
  },

  async toggleFavorito(id, userId) {
    const { rows } = await query(
      `UPDATE clientes SET favorito = NOT favorito
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async eliminar(id, userId) {
    await query(
      `DELETE FROM clientes WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return true;
  },
};

module.exports = {
  Usuarios,
  Turnos,
  Servicios,
  ServicioFotos,
  Cuponeras,
  Configuracion,
  Invitaciones,
  LoginIntentos,
  crearUsuarioAutoRegistro,
  buscarUsuarioPorEmail,
  WaPendientes,
  Sucursales,
  Clientes,
  Profesionales,
  HorariosProfesional,
  BloqueosProfesional,
  ClientesManual,
};
