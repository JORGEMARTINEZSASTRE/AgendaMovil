'use strict';

const axios = require('axios');
const { telefonoParaWhatsApp } = require('../utils/telefono');

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

if (!EVOLUTION_URL || !EVOLUTION_KEY) {
  console.warn('⚠️  [Evolution] Variables EVOLUTION_API_URL o EVOLUTION_API_KEY no configuradas');
}

// ─── Cliente HTTP pre-configurado ───────────────────────
const client = axios.create({
  baseURL: EVOLUTION_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': EVOLUTION_KEY,
  },
  timeout: 15000,
});

// ═══════════════════════════════════════════════════════════
//  GESTIÓN DE SESIONES
// ═══════════════════════════════════════════════════════════

async function crearInstancia(nombreInstancia) {
  try {
    const { data } = await client.post('/instance/create', {
      instanceName: nombreInstancia,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
    return { ok: true, data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[Evolution/crearInstancia]', msg);
    return { ok: false, error: msg };
  }
}

async function obtenerQR(nombreInstancia, numeroTelefono = null) {
  try {
    // Si mandan número, Evolution devuelve un pairing code
    const url = numeroTelefono
      ? `/instance/connect/${nombreInstancia}?number=${numeroTelefono}`
      : `/instance/connect/${nombreInstancia}`;

    const { data } = await client.get(url);
    return { ok: true, data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[Evolution/obtenerQR]', msg);
    return { ok: false, error: msg };
  }
}

async function estadoInstancia(nombreInstancia) {
  try {
    const { data } = await client.get(`/instance/connectionState/${nombreInstancia}`);
    return { ok: true, estado: data?.instance?.state || 'desconocido', data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[Evolution/estadoInstancia]', msg);
    return { ok: false, error: msg };
  }
}

async function eliminarInstancia(nombreInstancia) {
  try {
    await client.delete(`/instance/logout/${nombreInstancia}`);
    await client.delete(`/instance/delete/${nombreInstancia}`);
    return { ok: true };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[Evolution/eliminarInstancia]', msg);
    return { ok: false, error: msg };
  }
}

async function reiniciarInstancia(nombreInstancia) {
  try {
    const { data } = await client.put(`/instance/restart/${nombreInstancia}`);
    return { ok: true, data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[Evolution/reiniciarInstancia]', msg);
    return { ok: false, error: msg };
  }
}

// Cada punto del código que necesitaba saber si una operadora tenía
// WhatsApp conectado hacía su propio estadoInstancia() y, si no estaba
// "open", se rendía ahí mismo (como mucho avisando a Jorge). La mayoría
// de esos cortes no son un logout real desde el teléfono, sino que se
// cayó el socket de Evolution — y eso se resuelve reiniciando la
// instancia con las credenciales ya guardadas, sin pedir escanear el QR
// de nuevo. Por eso este es el único lugar que debería consultarse: si
// el reinicio no la revive, es porque de verdad hay que volver a
// vincular el teléfono, y ahí sí corresponde avisar.
// Detalle de la instancia (incluye por qué se desconectó la última vez).
// Evolution v2 devuelve disconnectionReasonCode: 401 = se deslogueó desde
// el teléfono (o WhatsApp la desvinculó), 440 = la reemplazó otra sesión,
// 408/428/500/515 = se cayó la conexión y alcanza con reiniciar.
async function infoInstancia(nombreInstancia) {
  try {
    const { data } = await client.get(`/instance/fetchInstances`, { params: { instanceName: nombreInstancia } });
    const inst = Array.isArray(data) ? data[0] : data;
    const i = inst?.instance || inst || {};
    return {
      ok: true,
      estado: i.connectionStatus || i.state || i.status || null,
      motivoCodigo: i.disconnectionReasonCode ?? null,
      motivoFecha: i.disconnectionAt ?? null,
      numero: (i.ownerJid || i.owner || '').split('@')[0] || null,
    };
  } catch (err) {
    return { ok: false, error: err.response?.data?.message || err.message };
  }
}

// Reiniciar una instancia que está en pleno "connecting" la interrumpe
// justo cuando Baileys se estaba reconectando solo, y reiniciarla cada
// 5 minutos (un reinicio por cada recordatorio que intentaba salir) es
// justamente el patrón que hace que WhatsApp termine desvinculando el
// dispositivo. Por eso: si está "connecting" se le da tiempo; y como
// mucho un reinicio cada 10 minutos por instancia.
const REINICIO_MIN_MS = 10 * 60 * 1000;
const ultimoReinicio = new Map(); // instance -> timestamp

async function estadoConReconexion(nombreInstancia) {
  const primero = await estadoInstancia(nombreInstancia);
  if (primero.ok && primero.estado === 'open') return primero;

  if (primero.ok && primero.estado === 'connecting') {
    await new Promise((r) => setTimeout(r, 5000));
    const otra = await estadoInstancia(nombreInstancia);
    if (otra.ok && otra.estado === 'open') return otra;
  }

  const ultimo = ultimoReinicio.get(nombreInstancia) || 0;
  if (Date.now() - ultimo < REINICIO_MIN_MS) return primero;
  ultimoReinicio.set(nombreInstancia, Date.now());

  const reinicio = await reiniciarInstancia(nombreInstancia);
  if (!reinicio.ok) return primero;

  await new Promise((r) => setTimeout(r, 5000));
  const segundo = await estadoInstancia(nombreInstancia);
  return segundo.ok ? segundo : primero;
}

// ═══════════════════════════════════════════════════════════
//  ENVÍO DE MENSAJES
// ═══════════════════════════════════════════════════════════

async function enviarMensaje(nombreInstancia, telefono, mensaje) {
  try {
    // A qué número sale el WhatsApp lo decide utils/telefono, el mismo
    // que decide cómo se guarda. Acá vivía una segunda versión con
    // reglas propias: un número argentino se guardaba como uruguayo y el
    // mensaje salía al argentino, o sea a otra persona.
    const telNormalizado = telefonoParaWhatsApp(telefono);

    const { data } = await client.post(`/message/sendText/${nombreInstancia}`, {
      number: telNormalizado,
      text: mensaje,
    });

    return { ok: true, data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[Evolution/enviarMensaje]', msg);
    return { ok: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════════════

async function ping() {
  try {
    const { data } = await client.get('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  crearInstancia,
  obtenerQR,
  estadoInstancia,
  estadoConReconexion,
  infoInstancia,
  reiniciarInstancia,
  eliminarInstancia,
  enviarMensaje,
  ping,
};