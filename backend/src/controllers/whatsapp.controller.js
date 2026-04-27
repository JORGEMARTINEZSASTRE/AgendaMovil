'use strict';

const { query } = require('../config/db');
const evolution = require('../services/evolution.service');

/**
 * Genera un nombre de instancia único para el usuario.
 * Ej: user_abc123...
 */
function nombreInstanciaDe(userId) {
  return `user_${userId}`;
}

// ═══════════════════════════════════════════════════════════
//  GET /api/whatsapp/estado
//  Devuelve el estado actual de la sesión del usuario.
// ═══════════════════════════════════════════════════════════
async function obtenerEstado(req, res) {
  try {
    const userId = req.user.id;
    const instance = nombreInstanciaDe(userId);

    // Buscar en la DB
    const { rows } = await query(
      `SELECT * FROM whatsapp_sesiones WHERE user_id = $1`,
      [userId]
    );

    const sesion = rows[0];

    // Si no hay sesión en la DB, no está conectado
    if (!sesion) {
      return res.json({ ok: true, conectado: false, estado: 'desconectado' });
    }

    // Consultar estado real en Evolution API
    const estadoReal = await evolution.estadoInstancia(instance);

    if (!estadoReal.ok) {
      return res.json({
        ok: true,
        conectado: false,
        estado: 'desconectado',
        numero: sesion.numero_conectado
      });
    }

    const estado = estadoReal.estado; // 'open', 'connecting', 'close'
    const conectado = estado === 'open';

    // Actualizar DB si cambió
    await query(
      `UPDATE whatsapp_sesiones 
       SET estado = $1, actualizado_en = NOW()
       WHERE user_id = $2`,
      [estado, userId]
    );

    return res.json({
      ok: true,
      conectado,
      estado,
      numero: sesion.numero_conectado
    });

  } catch (err) {
    console.error('[WHATSAPP/obtenerEstado]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener estado' });
  }
}

// ═══════════════════════════════════════════════════════════
//  POST /api/whatsapp/conectar
//  Crea una instancia y devuelve el QR para escanear.
// ═══════════════════════════════════════════════════════════
async function conectar(req, res) {
  try {
    const userId = req.user.id;
    const instance = nombreInstanciaDe(userId);

    // Verificar si ya existe
    const { rows } = await query(
      `SELECT * FROM whatsapp_sesiones WHERE user_id = $1`,
      [userId]
    );

    let crear;
    if (rows.length === 0) {
      // Crear instancia nueva en Evolution
      crear = await evolution.crearInstancia(instance);

      if (!crear.ok) {
        // Puede ser que ya exista en Evolution pero no en nuestra DB
        const estadoRes = await evolution.estadoInstancia(instance);
        if (!estadoRes.ok) {
          return res.status(500).json({
            ok: false,
            error: crear.error || 'No se pudo crear la instancia'
          });
        }
      }

      // Guardar en DB
      await query(
        `INSERT INTO whatsapp_sesiones (user_id, instance_name, estado)
         VALUES ($1, $2, 'pendiente')
         ON CONFLICT (instance_name) DO NOTHING`,
        [userId, instance]
      );
    }

    // Obtener QR
    const qr = await evolution.obtenerQR(instance);

    if (!qr.ok) {
      return res.status(500).json({ ok: false, error: qr.error });
    }

    // Evolution devuelve el QR en diferentes formatos según el caso
    const base64 = qr.data?.base64 || qr.data?.qrcode?.base64 || null;
    const code = qr.data?.code || qr.data?.qrcode?.code || null;

    return res.json({
      ok: true,
      qr: base64,
      code,
      raw: qr.data,
    });

  } catch (err) {
    console.error('[WHATSAPP/conectar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al conectar WhatsApp' });
  }
}

// ═══════════════════════════════════════════════════════════
//  POST /api/whatsapp/desconectar
//  Elimina la instancia y borra la sesión.
// ═══════════════════════════════════════════════════════════
async function desconectar(req, res) {
  try {
    const userId = req.user.id;
    const instance = nombreInstanciaDe(userId);

    await evolution.eliminarInstancia(instance);

    await query(
      `DELETE FROM whatsapp_sesiones WHERE user_id = $1`,
      [userId]
    );

    return res.json({ ok: true, mensaje: 'WhatsApp desconectado' });

  } catch (err) {
    console.error('[WHATSAPP/desconectar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al desconectar' });
  }
}

// ═══════════════════════════════════════════════════════════
//  POST /api/whatsapp/test
//  Envía un mensaje de prueba al mismo usuario conectado.
// ═══════════════════════════════════════════════════════════
async function enviarTest(req, res) {
  try {
    const userId = req.user.id;
    const instance = nombreInstanciaDe(userId);
    const { telefono, mensaje } = req.body;

    if (!telefono || !mensaje) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan telefono o mensaje'
      });
    }

    const result = await evolution.enviarMensaje(instance, telefono, mensaje);

    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true, data: result.data });

  } catch (err) {
    console.error('[WHATSAPP/enviarTest]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al enviar' });
  }
}

module.exports = {
  obtenerEstado,
  conectar,
  desconectar,
  enviarTest,
};