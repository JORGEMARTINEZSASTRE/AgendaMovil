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
  eliminarInstancia,
  enviarMensaje,
  ping,
};