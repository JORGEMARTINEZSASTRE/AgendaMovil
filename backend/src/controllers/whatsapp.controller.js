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

// Instancias con una vinculación por QR/código en curso ahora mismo, y
// desde cuándo. Mientras dura esta ventana, el polling de /estado NO debe
// reiniciar la instancia con estadoConReconexion(): el estado "connecting"
// o "close" es normal ahí (todavía no escaneó), y reiniciar en ese momento
// mata el socket que está esperando el escaneo, invalidando el QR antes de
// que la operadora llegue a usarlo.
const VINCULACION_VENTANA_MS = 3 * 60 * 1000; // igual al tope del polling del front (60 x 3s)
const vinculacionesEnCurso = new Map(); // instance -> timestamp

function marcarVinculacionEnCurso(instance) {
  vinculacionesEnCurso.set(instance, Date.now());
}

function vinculacionEnCurso(instance) {
  const marca = vinculacionesEnCurso.get(instance);
  if (!marca) return false;
  if (Date.now() - marca > VINCULACION_VENTANA_MS) {
    vinculacionesEnCurso.delete(instance);
    return false;
  }
  return true;
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

    // Consultar estado real en Evolution API. Con reintento de reconexión
    // automática (así, si alguien solo tuvo un corte de socket, el panel
    // la muestra conectada de nuevo sin que tenga que escanear nada) —
    // salvo que haya una vinculación por QR en curso ahora mismo, donde
    // reiniciar la instancia mataría el socket que está esperando el
    // escaneo.
    const estadoReal = vinculacionEnCurso(instance)
      ? await evolution.estadoInstancia(instance)
      : await evolution.estadoConReconexion(instance);

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

    if (conectado) vinculacionesEnCurso.delete(instance);

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
    const { telefono } = req.body; // Opcional — si lo mandan, devuelve pairing code

    marcarVinculacionEnCurso(instance);

    // Verificar si ya existe en DB
    const { rows } = await query(
      `SELECT * FROM whatsapp_sesiones WHERE user_id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      // Crear instancia nueva
      const crear = await evolution.crearInstancia(instance);

      if (!crear.ok) {
        // Puede que ya exista en Evolution pero no en nuestra DB
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

    // Obtener QR o pairing code
    const qr = await evolution.obtenerQR(instance, telefono);

    if (!qr.ok) {
      return res.status(500).json({ ok: false, error: qr.error });
    }

    // Evolution puede devolver varios formatos
    const base64 = qr.data?.base64 || qr.data?.qrcode?.base64 || null;
    const code = qr.data?.code || qr.data?.qrcode?.code || null;
    const pairingCode = qr.data?.pairingCode || null;

    return res.json({
      ok: true,
      qr: base64,         // imagen del QR en base64
      code,               // string del QR
      pairingCode,        // código de 8 dígitos
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

// ═══════════════════════════════════════════════════════════
//  ADMIN — ver / revivir el WhatsApp de una operadora
//  GET  /api/admin/usuarios/:id/whatsapp          → estado (reinicia si se cayó el socket)
//  POST /api/admin/usuarios/:id/whatsapp/vincular → pairing code (8 dígitos) para
//       mandarle a la operadora, que lo carga en WhatsApp > Dispositivos vinculados.
// ═══════════════════════════════════════════════════════════
async function adminEstado(req, res) {
  try {
    const userId = req.params.id;
    const instance = nombreInstanciaDe(userId);
    const { rows } = await query(`SELECT * FROM whatsapp_sesiones WHERE user_id = $1`, [userId]);
    const sesion = rows[0] || null;
    const estadoReal = await evolution.estadoConReconexion(instance);
    const info = await evolution.infoInstancia(instance);
    if (sesion && estadoReal.ok) {
      await query(
        `UPDATE whatsapp_sesiones SET estado = $1, actualizado_en = NOW() WHERE user_id = $2`,
        [estadoReal.estado, userId]
      );
    }
    return res.json({
      ok: true,
      instance,
      sesionEnDB: !!sesion,
      numero: sesion?.numero_conectado || null,
      estado: estadoReal.ok ? estadoReal.estado : 'error',
      conectado: estadoReal.ok && estadoReal.estado === 'open',
      error: estadoReal.ok ? null : estadoReal.error,
      motivoCodigo: info.ok ? info.motivoCodigo : null,
      motivoFecha: info.ok ? info.motivoFecha : null,
      numeroVinculado: info.ok ? info.numero : null,
    });
  } catch (err) {
    console.error('[WHATSAPP/adminEstado]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener estado' });
  }
}

async function adminVincular(req, res) {
  try {
    const userId = req.params.id;
    const instance = nombreInstanciaDe(userId);
    const { rows: u } = await query(`SELECT telefono FROM usuarios WHERE id = $1`, [userId]);
    if (!u[0]) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const telefono = String(req.body?.telefono || u[0].telefono || '').replace(/\D/g, '') || null;

    marcarVinculacionEnCurso(instance);

    const { rows } = await query(`SELECT 1 FROM whatsapp_sesiones WHERE user_id = $1`, [userId]);
    if (rows.length === 0) {
      const crear = await evolution.crearInstancia(instance);
      if (!crear.ok) {
        const est = await evolution.estadoInstancia(instance);
        if (!est.ok) return res.status(500).json({ ok: false, error: crear.error });
      }
      await query(
        `INSERT INTO whatsapp_sesiones (user_id, instance_name, estado)
         VALUES ($1, $2, 'pendiente') ON CONFLICT (instance_name) DO NOTHING`,
        [userId, instance]
      );
    }

    const qr = await evolution.obtenerQR(instance, telefono);
    if (!qr.ok) return res.status(500).json({ ok: false, error: qr.error });

    return res.json({
      ok: true,
      telefono,
      pairingCode: qr.data?.pairingCode || null,
      qr: qr.data?.base64 || qr.data?.qrcode?.base64 || null,
    });
  } catch (err) {
    console.error('[WHATSAPP/adminVincular]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al vincular' });
  }
}

async function adminResumen(req, res) {
  try {
    const { rows } = await query(`
      SELECT ws.user_id, ws.estado, ws.actualizado_en, u.nombre, u.nombre_negocio, u.email
      FROM whatsapp_sesiones ws JOIN usuarios u ON u.id = ws.user_id ORDER BY u.nombre`);
    const out = [];
    for (const r of rows) {
      const info = await evolution.infoInstancia(nombreInstanciaDe(r.user_id));
      out.push({ ...r, evolution: info });
    }
    return res.json({ ok: true, sesiones: out });
  } catch (err) {
    console.error('[WHATSAPP/adminResumen]', err.message);
    return res.status(500).json({ ok: false, error: 'Error' });
  }
}

module.exports = {
  adminResumen,
  obtenerEstado,
  conectar,
  desconectar,
  enviarTest,
  adminEstado,
  adminVincular,
};