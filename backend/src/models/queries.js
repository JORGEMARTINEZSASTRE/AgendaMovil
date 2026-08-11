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
             t.confirmacion_estado, t.no_vino,
             s.nombre AS sucursal_nombre,
             s.tipo   AS sucursal_tipo,
             -- Si ya hay un movimiento de caja para este turno, está cobrado.
             -- No se puede usar estado_pago: eso se pone en 'pagado' al
             -- confirmar la seña, que es otra cosa.
             EXISTS (
               SELECT 1 FROM movimientos m
                WHERE m.turno_id = t.id AND m.categoria = 'Turno'
             ) AS cobrado
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

    try {
      const { rows } = await query(sql, params);
      return rows;
    } catch (err) {
      // 42P01 = la tabla movimientos todavía no existe (migración no corrida).
      // La agenda es la pantalla principal: antes de dejarla en blanco,
      // devolvemos los turnos sin el dato de cobrado.
      if (err.code !== '42P01') throw err;
      console.warn('[Turnos/listar] Sin tabla movimientos, sigo sin el dato de cobrado');
      const { rows } = await query(
        sql.replace(/EXISTS \([\s\S]*?\) AS cobrado/, 'FALSE AS cobrado'),
        params
      );
      return rows;
    }
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
    // Toda clienta con turno queda en su lista de clientas. Va acá, en el
    // alta del turno, para que valga igual cargándolo ella desde el panel.
    await ClientesManual.registrarDesdeTurno(userId, { nombre, telefono, cumpleDia, cumpleMes });
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

  /**
   * Los cumpleaños del mes salen de la ficha de la clienta, no de sus
   * turnos. Antes se leían de turnos: una clienta con tres turnos
   * aparecía tres veces, y la que no volvía desaparecía de la lista
   * aunque su cumpleaños siguiera siendo el mismo.
   */
  async getCumples(userId) {
    const mesActual = new Date().getMonth() + 1;
    const { rows } = await query(
      `SELECT id, nombre, telefono, cumple_dia, cumple_mes
       FROM clientes
       WHERE user_id = $1
         AND cumple_mes = $2
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
      totalSesiones, precioTotal, notas, medioPago,
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
    const cuponera = rows[0];

    // La plata de la cuponera entra toda hoy, el día que la compró. Las
    // sesiones que use después van en $0, si no se contaría dos veces.
    // Si falla, la cuponera igual queda creada: mejor una cuponera sin
    // el movimiento (que se puede cargar a mano) que perder la venta.
    if (parseFloat(precioTotal) > 0) {
      try {
        await Caja.crear(userId, {
          tipo:          'ingreso',
          categoria:     'Cuponera',
          concepto:      servicioNombre
            ? `Cuponera de ${totalSesiones} · ${servicioNombre}`
            : `Cuponera de ${totalSesiones} sesiones`,
          monto:         parseFloat(precioTotal),
          medioPago:     medioPago || 'efectivo',
          cuponeraId:    cuponera.id,
          clienteNombre: clienteNombre,
        });
      } catch (err) {
        console.error('[Cuponeras/crear] No se pudo registrar el ingreso:', err.message);
      }
    }

    return cuponera;
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

  /**
   * Da de alta a la clienta cada vez que saca un turno, venga de donde
   * venga: la reserva pública, el panel o la confirmación de una seña.
   * Antes la lista de clientas se llenaba sólo a mano, así que quien
   * reservaba sola no quedaba registrada en ningún lado.
   *
   * Si ya existe se actualiza el nombre (se pudo haber escrito mejor) y
   * se completa el cumpleaños **sólo si todavía no tenía**: un dato que
   * ya está cargado no se pisa con un vacío.
   *
   * Nunca tira: registrar a la clienta no puede hacer fallar un turno.
   */
  async registrarDesdeTurno(userId, { nombre, telefono, cumpleDia, cumpleMes }) {
    if (!userId || !telefono || !nombre) return null;
    try {
      const dia = Number(cumpleDia) >= 1 && Number(cumpleDia) <= 31 ? Number(cumpleDia) : null;
      const mes = Number(cumpleMes) >= 1 && Number(cumpleMes) <= 12 ? Number(cumpleMes) : null;

      const { rows } = await query(
        `INSERT INTO clientes (user_id, nombre, telefono, cumple_dia, cumple_mes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, telefono) DO UPDATE
           SET nombre     = EXCLUDED.nombre,
               cumple_dia = COALESCE(clientes.cumple_dia, EXCLUDED.cumple_dia),
               cumple_mes = COALESCE(clientes.cumple_mes, EXCLUDED.cumple_mes)
         RETURNING *`,
        [userId, String(nombre).trim().slice(0, 255), telefono, dia, mes]
      );
      return rows[0] || null;
    } catch (err) {
      console.error('[CLIENTES/registrarDesdeTurno]', err.message);
      return null;
    }
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

// ── Caja ─────────────────────────────────────────────────────────────
// Todo lo que entra y sale. Un movimiento nunca se edita ni se borra
// desde la app: se anula borrando la fila, porque la caja de una
// estética chica no necesita libro de auditoría y sí necesita poder
// corregir un cero de más sin llamar a nadie.
const CATEGORIAS_INGRESO = ['Turno', 'Seña', 'Cuponera', 'Producto', 'Otro'];
// "Retiro" es la plata que la operadora (o los socios) sacan de la caja.
// Sin esta categoría el saldo acumulado crecería para siempre, aunque la
// plata ya no esté.
const CATEGORIAS_GASTO   = ['Insumos', 'Alquiler de jornada', 'Transporte',
                            'Publicidad', 'Materiales', 'Sueldos',
                            'Retiro', 'Otro'];
const MEDIOS_PAGO        = ['efectivo', 'transferencia', 'tarjeta', 'billetera', 'cuponera'];

const Caja = {
  CATEGORIAS_INGRESO,
  CATEGORIAS_GASTO,
  MEDIOS_PAGO,

  async listar(userId, { desde, hasta, tipo = null, limite = 300 }) {
    const params = [userId, desde, hasta];
    let filtroTipo = '';
    if (tipo) { params.push(tipo); filtroTipo = `AND m.tipo = $${params.length}`; }
    params.push(limite);

    const { rows } = await query(
      `SELECT m.*, t.nombre AS turno_cliente, t.servicio_nombre
         FROM movimientos m
         LEFT JOIN turnos t ON t.id = m.turno_id
        WHERE m.user_id = $1
          AND m.fecha BETWEEN $2 AND $3
          ${filtroTipo}
        ORDER BY m.fecha DESC, m.creado_en DESC
        LIMIT $${params.length}`,
      params
    );
    return rows;
  },

  async crear(userId, m) {
    const { rows } = await query(
      `INSERT INTO movimientos
         (user_id, tipo, categoria, concepto, monto, medio_pago, fecha,
          turno_id, cuponera_id, sucursal_id, profesional_id, profesional_nombre, cliente_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_DATE),$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [userId, m.tipo, m.categoria, m.concepto || null, m.monto, m.medioPago || 'efectivo',
       m.fecha || null, m.turnoId || null, m.cuponeraId || null, m.sucursalId || null,
       m.profesionalId || null, m.profesionalNombre || null, m.clienteNombre || null]
    );
    return rows[0];
  },

  async eliminar(id, userId) {
    const { rows } = await query(
      `DELETE FROM movimientos WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return rows.length > 0;
  },

  // Totales del período, más los dos desgloses que la operadora mira:
  // en qué se le fue la plata, y cuánto tiene que haber en efectivo.
  async resumen(userId, { desde, hasta }) {
    const params = [userId, desde, hasta];

    const { rows: tot } = await query(
      `SELECT
         COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0) AS ingresos,
         COALESCE(SUM(monto) FILTER (WHERE tipo = 'gasto'),   0) AS gastos
       FROM movimientos
       WHERE user_id = $1 AND fecha BETWEEN $2 AND $3`,
      params
    );

    const { rows: porMedio } = await query(
      `SELECT medio_pago,
              COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0) AS ingresos,
              COALESCE(SUM(monto) FILTER (WHERE tipo = 'gasto'),   0) AS gastos
         FROM movimientos
        WHERE user_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY medio_pago
        ORDER BY 2 DESC`,
      params
    );

    const { rows: porCategoria } = await query(
      `SELECT tipo, categoria, SUM(monto) AS total, COUNT(*) AS cantidad
         FROM movimientos
        WHERE user_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY tipo, categoria
        ORDER BY total DESC`,
      params
    );

    const { rows: porProfesional } = await query(
      `SELECT COALESCE(profesional_nombre, 'Sin asignar') AS profesional,
              SUM(monto) AS total, COUNT(*) AS cantidad
         FROM movimientos
        WHERE user_id = $1 AND fecha BETWEEN $2 AND $3 AND tipo = 'ingreso'
        GROUP BY 1
        ORDER BY total DESC`,
      params
    );

    // Lo que sobró de todos los meses anteriores. Se calcula sumando, no
    // se guarda en ninguna tabla: así nunca se puede desincronizar si se
    // borra o se corrige un movimiento viejo.
    const { rows: prev } = await query(
      `SELECT COALESCE(
                SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0
              ) AS saldo
         FROM movimientos
        WHERE user_id = $1 AND fecha < $2`,
      [userId, desde]
    );

    const ingresos      = parseFloat(tot[0].ingresos);
    const gastos        = parseFloat(tot[0].gastos);
    const ganancia      = ingresos - gastos;
    const saldoAnterior = parseFloat(prev[0].saldo);

    const reparto = await Caja.repartoSocios(userId, ganancia);

    return {
      ingresos,
      gastos,
      ganancia,
      saldoAnterior,
      enCaja: saldoAnterior + ganancia,
      porMedio,
      porCategoria,
      porProfesional,
      reparto,
    };
  },

  // Si la operadora no cargó socios activos, devuelve null y la app ni
  // muestra el bloque. No es una función que se pueda "desactivar a
  // medias": o hay socios o no los hay.
  async repartoSocios(userId, ganancia) {
    const { rows } = await query(
      `SELECT id, nombre, porcentaje
         FROM socios
        WHERE user_id = $1 AND activo = TRUE
        ORDER BY porcentaje DESC, nombre`,
      [userId]
    );
    if (!rows.length) return null;

    return rows.map(s => ({
      id:         s.id,
      nombre:     s.nombre,
      porcentaje: parseFloat(s.porcentaje),
      monto:      Math.round(ganancia * parseFloat(s.porcentaje)) / 100,
    }));
  },

  // Cobrar un turno. La seña que ya entró se descuenta acá para no contar
  // la misma plata dos veces: si el servicio son 1000 y ya pagó 300 de
  // seña, el movimiento del cobro es por 700.
  async cobrarTurno(userId, turnoId, { monto, medioPago, fecha }) {
    const { rows: tRows } = await query(
      `SELECT t.*, s.precio AS servicio_precio
         FROM turnos t
         LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.id = $1 AND t.user_id = $2`,
      [turnoId, userId]
    );
    if (!tRows.length) return { error: 'no_encontrado' };

    const turno = tRows[0];
    if (turno.estado === 'cancelado') return { error: 'cancelado' };

    const { rows: yaRows } = await query(
      `SELECT id FROM movimientos
        WHERE turno_id = $1 AND categoria = 'Turno'`,
      [turnoId]
    );
    if (yaRows.length) return { error: 'ya_cobrado' };

    const movimiento = await Caja.crear(userId, {
      tipo:              'ingreso',
      categoria:         'Turno',
      concepto:          turno.servicio_nombre || 'Turno',
      monto,
      medioPago,
      fecha:             fecha || turno.fecha,
      turnoId,
      sucursalId:        turno.sucursal_id,
      profesionalId:     turno.profesional_id,
      profesionalNombre: turno.profesional_nombre,
      clienteNombre:     turno.nombre,
    });

    // Si pagó con cuponera, se le descuenta una sesión. Si falla, el
    // cobro igual queda: la sesión se puede descontar a mano desde la
    // pestaña Cuponeras, pero la plata no se puede perder.
    let sesionDescontada = null;
    if (medioPago === 'cuponera') {
      try {
        const cup = await Caja.cuponeraActivaDe(userId, turno.telefono, turno.servicio_id);
        if (cup) {
          const r = await Cuponeras.registrarUso(cup.id, userId, { turnoId });
          if (!r.error) sesionDescontada = { cuponeraId: cup.id };
        }
      } catch (err) {
        console.error('[Caja/cobrarTurno] No se pudo descontar la sesión:', err.message);
      }
    }

    await query(
      `UPDATE turnos SET estado_pago = 'pagado', editado_en = NOW()
        WHERE id = $1 AND user_id = $2`,
      [turnoId, userId]
    );

    return { movimiento, turno, sesionDescontada };
  },

  // Marcar (o desmarcar) que la clienta no vino. Devuelve cuántas veces
  // le faltó en total, que es el dato que la operadora necesita para
  // decidir si le pide seña la próxima.
  async marcarNoVino(userId, turnoId, noVino) {
    const { rows } = await query(
      `UPDATE turnos
          SET no_vino    = $3,
              no_vino_en = CASE WHEN $3 THEN NOW() ELSE NULL END,
              editado_en = NOW()
        WHERE id = $1 AND user_id = $2 AND estado != 'cancelado'
        RETURNING id, nombre, telefono, no_vino`,
      [turnoId, userId, !!noVino]
    );
    if (!rows.length) return null;

    const t = rows[0];
    const faltas = await Caja.contarFaltas(userId, t.telefono);
    return { turno: t, faltas };
  },

  // Cuántas veces faltó esa clienta. Se busca por teléfono porque las
  // clientas son un agrupamiento de turnos, no una tabla.
  async contarFaltas(userId, telefono) {
    if (!telefono) return 0;
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n
         FROM turnos
        WHERE user_id = $1 AND telefono = $2 AND no_vino = TRUE`,
      [userId, telefono]
    );
    return rows[0] ? rows[0].n : 0;
  },

  // Lo que le quedó por cobrar: turnos que ya pasaron, que no se
  // cancelaron y que no tienen movimiento de cobro. No hace falta una
  // tabla de deudas — la deuda es la ausencia del cobro.
  //
  // Se corta a 6 meses para atrás: más viejo que eso no es una deuda que
  // vaya a cobrar, es un turno que se olvidó de marcar y sólo hace ruido.
  async deudas(userId) {
    const { rows } = await query(
      `SELECT t.id, t.nombre, t.telefono, t.fecha, t.hora,
              t.servicio_nombre, t.servicio_zona, t.duracion,
              COALESCE(s.precio, 0) AS precio,
              CASE WHEN t.senia_pagada THEN COALESCE(t.monto_senia, 0) ELSE 0 END AS senia
         FROM turnos t
         LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.user_id = $1
          AND t.estado != 'cancelado'
          -- Si no vino, no debe nada: no recibió el servicio.
          AND COALESCE(t.no_vino, FALSE) = FALSE
          AND (t.fecha + t.hora) < NOW()
          AND t.fecha >= CURRENT_DATE - INTERVAL '6 months'
          AND NOT EXISTS (
            SELECT 1 FROM movimientos m
             WHERE m.turno_id = t.id AND m.categoria = 'Turno'
          )
        ORDER BY t.fecha DESC, t.hora DESC
        LIMIT 300`,
      [userId]
    );

    let total = 0;
    let sinPrecio = 0;

    const deudas = rows.map(r => {
      const precio = parseFloat(r.precio) || 0;
      const senia  = parseFloat(r.senia)  || 0;
      const debe   = Math.max(precio - senia, 0);

      if (precio > 0) total += debe;
      else sinPrecio += 1;

      return {
        turno_id:        r.id,
        cliente:         r.nombre,
        telefono:        r.telefono,
        fecha:           r.fecha,
        hora:            r.hora,
        servicio_nombre: r.servicio_nombre,
        servicio_zona:   r.servicio_zona,
        precio,
        senia_cobrada:   senia,
        debe,
      };
    });

    // Cuántas clientas distintas, que es el número que ella mira primero.
    const clientas = new Set(deudas.map(d => (d.telefono || d.cliente || '').trim())).size;

    return { deudas, total, clientas, sinPrecio };
  },

  // Máximo de avisos por turno. No es configurable a propósito: insistirle
  // más de tres veces a una clienta por plata deja de ser un recordatorio.
  MAX_AVISOS_COBRO: 3,

  async getAvisos(userId) {
    const { rows } = await query(
      `SELECT COALESCE(cobro_aviso_activo, FALSE)  AS activo,
              COALESCE(cobro_aviso_dias, 3)        AS dias,
              COALESCE(cobro_aviso_repetir, 0)     AS repetir
         FROM usuarios WHERE id = $1`,
      [userId]
    );
    if (!rows.length) return { activo: false, dias: 3, repetir: 0 };
    return {
      activo:  rows[0].activo,
      dias:    parseInt(rows[0].dias),
      repetir: parseInt(rows[0].repetir),
      max:     Caja.MAX_AVISOS_COBRO,
    };
  },

  async guardarAvisos(userId, { activo, dias, repetir }) {
    await query(
      `UPDATE usuarios
          SET cobro_aviso_activo  = $2,
              cobro_aviso_dias    = $3,
              cobro_aviso_repetir = $4
        WHERE id = $1`,
      [userId, !!activo, dias, repetir]
    );
    return Caja.getAvisos(userId);
  },

  async listarSocios(userId) {
    const { rows } = await query(
      `SELECT id, nombre, porcentaje, activo
         FROM socios
        WHERE user_id = $1
        ORDER BY porcentaje DESC, nombre`,
      [userId]
    );
    return rows.map(s => ({ ...s, porcentaje: parseFloat(s.porcentaje) }));
  },

  // Se reemplaza la lista entera. Mandar un array vacío es la forma de
  // apagar el reparto: sin socios, la app no muestra el bloque.
  async guardarSocios(userId, socios) {
    const cliente = await getClient();
    try {
      await cliente.query('BEGIN');
      await cliente.query('DELETE FROM socios WHERE user_id = $1', [userId]);

      for (const s of socios) {
        await cliente.query(
          `INSERT INTO socios (user_id, nombre, porcentaje, activo)
           VALUES ($1, $2, $3, TRUE)`,
          [userId, String(s.nombre).trim().slice(0, 100), parseFloat(s.porcentaje)]
        );
      }
      await cliente.query('COMMIT');
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw err;
    } finally {
      cliente.release();
    }
    return Caja.listarSocios(userId);
  },

  // Cuponera activa de esa clienta con sesiones disponibles. Se busca por
  // teléfono porque las clientas no son filas de una tabla: son turnos
  // agrupados. Si la cuponera es de un servicio puntual, se prioriza la
  // del mismo servicio del turno.
  async cuponeraActivaDe(userId, telefono, servicioId) {
    if (!telefono) return null;
    const { rows } = await query(
      `SELECT c.id, c.servicio_id, c.total_sesiones,
              (SELECT COUNT(*) FROM cuponera_usos u WHERE u.cuponera_id = c.id) AS usadas
         FROM cuponeras c
        WHERE c.user_id = $1 AND c.activa = TRUE AND c.cliente_telefono = $2
        ORDER BY (c.servicio_id IS NOT DISTINCT FROM $3) DESC, c.creada_en ASC`,
      [userId, telefono, servicioId || null]
    );
    return rows.find(c => parseInt(c.usadas) < parseInt(c.total_sesiones)) || null;
  },

  // Cuánto le falta cobrar a este turno: el precio del servicio menos la
  // seña que ya entró. Es sólo una sugerencia para precargar el campo;
  // la operadora siempre puede escribir otro número.
  async sugerirCobro(userId, turnoId) {
    const { rows } = await query(
      `SELECT t.monto_senia, t.senia_pagada, t.senia_eximida,
              t.servicio_nombre, t.nombre AS cliente,
              t.telefono, t.servicio_id,
              COALESCE(s.precio, 0) AS precio
         FROM turnos t
         LEFT JOIN servicios s ON s.id = t.servicio_id
        WHERE t.id = $1 AND t.user_id = $2`,
      [turnoId, userId]
    );
    if (!rows.length) return null;

    const t       = rows[0];
    const precio  = parseFloat(t.precio) || 0;
    const senia   = t.senia_pagada ? (parseFloat(t.monto_senia) || 0) : 0;

    // Si tiene cuponera con sesiones, ese turno ya está pago: se sugiere
    // $0 y el medio "cuponera", que además descuenta la sesión al cobrar.
    const cup = await Caja.cuponeraActivaDe(userId, t.telefono, t.servicio_id);
    const conCuponera = !!cup;
    const sugerido = conCuponera ? 0 : Math.max(precio - senia, 0);

    return {
      precio,
      senia_cobrada:   senia,
      sugerido,
      con_cuponera:    conCuponera,
      cuponera_restantes: cup ? parseInt(cup.total_sesiones) - parseInt(cup.usadas) : 0,
      servicio_nombre: t.servicio_nombre,
      cliente:         t.cliente,
    };
  },
};

module.exports = {
  Caja,
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
