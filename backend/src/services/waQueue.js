'use strict';

const { WaPendientes } = require('../models/queries');
const { generar } = require('./waPlantillas');

/**
 * Encola un mensaje de WhatsApp para que la estética lo envíe.
 * Nunca bloquea el flujo principal.
 *
 * @param {object} opts
 * @param {string} opts.userId      UUID de la estética
 * @param {number} [opts.turnoId]   ID del turno (opcional, para dedup)
 * @param {string} opts.tipo        Tipo de plantilla (ver waPlantillas.js)
 * @param {string} opts.nombre      Nombre del destinatario
 * @param {string} opts.telefono    Teléfono del destinatario
 * @param {object|array} opts.datos Datos que se pasan a la plantilla
 * @param {string} [opts.fechaEvento] Fecha del evento (YYYY-MM-DD)
 */
async function encolar({ userId, turnoId, tipo, nombre, telefono, datos, fechaEvento }) {
  try {
    if (!telefono) {
      console.warn(`[waQueue] Sin teléfono — tipo=${tipo}, userId=${userId}`);
      return null;
    }

    const mensaje = generar(tipo, datos);
    if (!mensaje) return null;

    return await WaPendientes.crear({
      userId,
      turnoId,
      tipo,
      nombre,
      telefono,
      mensaje,
      fechaEvento,
    });
  } catch (err) {
    console.error('[waQueue] Error:', err.message);
    return null;
  }
}

module.exports = { encolar };