'use strict';

// ═══════════════════════════════════════════════════════════
//  PLANTILLAS WHATSAPP — DEPIMÓVIL PRO
// ═══════════════════════════════════════════════════════════

const meses = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatearFecha(fecha) {
  if (!fecha) return '';
  
  let d;
  
  // Si ya es un objeto Date
  if (fecha instanceof Date) {
    d = fecha;
  } 
  // Si es string ISO o "YYYY-MM-DD"
  else if (typeof fecha === 'string') {
    // Tomar solo la parte de fecha si viene con tiempo
    const soloFecha = fecha.includes('T') ? fecha.split('T')[0] : fecha.slice(0, 10);
    const [a, m, dia] = soloFecha.split('-').map(Number);
    if (!a || !m || !dia) return '';
    return `${dia} de ${meses[m - 1]} de ${a}`;
  }
  else {
    return '';
  }
  
  // Si llegamos acá es un Date válido
  const dia = d.getDate();
  const mes = d.getMonth();
  const anio = d.getFullYear();
  
  if (isNaN(dia)) return '';
  
  return `${dia} de ${meses[mes]} de ${anio}`;
}

function soloHora(hora) {
  return (hora || '').slice(0, 5);
}

const plantillas = {
  // ─── Para la CLIENTA ──────────────────────────────────────
  reserva_confirmada: (t, estetica) => 
    `¡Hola ${t.nombre}! 🌸 Confirmamos tu turno:\n\n` +
    `📅 ${formatearFecha(t.fecha)}\n` +
    `🕐 ${soloHora(t.hora)} hs\n` +
    (t.servicio_nombre ? `✂️ ${t.servicio_nombre}\n` : '') +
    `\nTe espero en ${estetica.nombre_negocio || estetica.nombre} 💕`,

  senia_pendiente: (t, estetica) =>
    `¡Hola ${t.nombre}! 🌸 Gracias por reservar tu turno:\n\n` +
    `📅 ${formatearFecha(t.fecha)} a las ${soloHora(t.hora)}\n` +
    (t.servicio_nombre ? `✂️ ${t.servicio_nombre}\n` : '') +
    `\n⚠️ Para *confirmar* necesito la seña de *$${t.monto_senia}*.\n` +
    `Avisame cuando la transfieras y te confirmo el turno 💕`,

  senia_confirmada: (t, estetica) =>
    `¡Hola ${t.nombre}! ✅ Recibí tu seña de $${t.monto_senia}.\n\n` +
    `Tu turno está confirmado para el ${formatearFecha(t.fecha)} a las ${soloHora(t.hora)}.\n` +
    `¡Te espero! 🌸`,

  recordatorio_24h_clienta: (t) =>
    `¡Hola ${t.nombre}! 🌸 Te recuerdo tu turno:\n\n` +
    `📅 *Mañana* ${formatearFecha(t.fecha)}\n` +
    `🕐 ${soloHora(t.hora)} hs\n` +
    (t.servicio_nombre ? `✂️ ${t.servicio_nombre}\n` : '') +
    `\nSi no podés venir, avisame con tiempo 💕`,

  recordatorio_2h_clienta: (t) =>
    `¡Hola ${t.nombre}! 🌸 Te espero en 2 horas, a las ${soloHora(t.hora)}. ¡Nos vemos! 💕`,

  turno_modificado_clienta: (t, cambios) => {
    let msg = `Hola ${t.nombre}! Te reprogramé el turno 🌸\n\n`;
    if (cambios.fecha)     msg += `📅 Nueva fecha: ${formatearFecha(t.fecha)}\n`;
    if (cambios.hora)      msg += `🕐 Nueva hora: ${soloHora(t.hora)}\n`;
    if (cambios.servicio)  msg += `✂️ ${t.servicio_nombre}\n`;
    msg += `\n¿Te queda bien? Avisame 💕`;
    return msg;
  },

  turno_cancelado_clienta: (t) =>
    `Hola ${t.nombre}, tuve que cancelar tu turno del ${formatearFecha(t.fecha)} ` +
    `a las ${soloHora(t.hora)} 😔\n\n¿Querés que te busque otro día? 💕`,

  cumple_clienta: (nombre) =>
    `¡Hola ${nombre}! 🎂🎉 Te deseo un muy feliz cumpleaños. Que tengas un día hermoso 💕🌸`,

  // ─── Para la ESTÉTICA (admin o reenvíos) ──────────────────
  recordatorio_24h_estetica: (t) =>
    `🌸 Recordatorio: *mañana* tenés turno con *${t.nombre}*\n` +
    `🕐 ${soloHora(t.hora)} hs${t.servicio_nombre ? ` · ${t.servicio_nombre}` : ''}\n` +
    `📞 ${t.telefono}`,

  nueva_reserva_estetica: (t) =>
    `🌸 Nueva reserva recibida:\n\n` +
    `👤 ${t.nombre}\n` +
    `📞 ${t.telefono}\n` +
    `📅 ${formatearFecha(t.fecha)} a las ${soloHora(t.hora)}\n` +
    (t.servicio_nombre ? `✂️ ${t.servicio_nombre}\n` : '') +
    (t.senia_requerida ? `\n⚠️ Pendiente de seña ($${t.monto_senia})` : ''),

  // ─── Para el ADMIN (vos) ──────────────────────────────────
  trial_por_vencer_admin: (u, dias) =>
    `⏰ Trial por vencer:\n\n` +
    `👤 ${u.nombre}${u.nombre_negocio ? ` (${u.nombre_negocio})` : ''}\n` +
    `📧 ${u.email}\n` +
    `📅 Le quedan ${dias} día${dias !== 1 ? 's' : ''}`,

  trial_vencido_admin: (u) =>
    `🚫 Trial vencido:\n\n` +
    `👤 ${u.nombre}${u.nombre_negocio ? ` (${u.nombre_negocio})` : ''}\n` +
    `📧 ${u.email}`,
};

/**
 * Genera el mensaje según el tipo
 */
function generar(tipo, datos) {
  const fn = plantillas[tipo];
  if (!fn) {
    console.warn(`[waPlantillas] Tipo desconocido: ${tipo}`);
    return null;
  }
  return fn(...(Array.isArray(datos) ? datos : [datos]));
}

module.exports = { generar, plantillas };