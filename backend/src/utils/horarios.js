'use strict';

/**
 * Horarios de trabajo: una sola versión de la verdad.
 *
 * Esto vivía copiado en tres lados —turnos.controller, publica.routes y
 * sucursales.controller— y las copias se habían separado. No era un
 * problema estético: decidían cosas distintas sobre los mismos datos.
 *
 *   - El panel miraba UN solo bloque por día (`horarios.find`), así que
 *     una operadora con turno cortado (9 a 12 y 15 a 20) no podía cargar
 *     un turno a las 16. La agenda pública sí se lo ofrecía a la clienta.
 *   - El panel exigía `activo`; la agenda pública ni lo miraba, así que
 *     un día apagado se seguía ofreciendo igual.
 *   - Uno aceptaba "16:00:00" y el otro no; uno daba por válido "99:99".
 *
 * Reglas que quedan, que son las que la app promete en pantalla:
 *   - Valen TODOS los bloques del día (el botón "+ turno cortado" existe).
 *   - `activo: false` apaga el bloque. Si el campo no viene, cuenta como
 *     activo: los horarios de profesional no tienen esa columna.
 *   - Se acepta "HH:MM" y "HH:MM:SS" (Postgres devuelve time con segundos).
 */

/** "16:30" o "16:30:00" -> 990 minutos desde medianoche. */
function toMin(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return (h * 60) + (m || 0);
}

/** 0 = domingo … 6 = sábado, igual que Date.getDay(). */
function diaSemanaNumero(fechaStr) {
  const d = new Date(`${String(fechaStr).slice(0, 10)}T00:00:00`);
  return d.getDay();
}

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Deja los bloques en una forma única y descarta los que no sirven.
 * Un bloque inválido se tira en silencio: es preferible ofrecer menos
 * horarios que romper la agenda entera por una fila mal guardada.
 */
function normalizarHorarios(horarios) {
  if (!Array.isArray(horarios)) return [];
  return horarios
    .map(h => ({
      dia:    Number(h?.dia),
      desde:  String(h?.desde ?? '').slice(0, 5),
      hasta:  String(h?.hasta ?? '').slice(0, 5),
      // Sin el campo se asume que trabaja: los horarios de profesional
      // no lo traen y apagarlos por omisión dejaría a nadie sin agenda.
      activo: h?.activo === undefined ? true : Boolean(h.activo),
    }))
    .filter(h =>
      Number.isInteger(h.dia) && h.dia >= 0 && h.dia <= 6 &&
      RE_HORA.test(h.desde) && RE_HORA.test(h.hasta) &&
      h.desde < h.hasta
    );
}

/** Los bloques de un día concreto, ya normalizados y sin los apagados. */
function bloquesDelDia(horarios, fecha) {
  const dia = diaSemanaNumero(fecha);
  return normalizarHorarios(horarios)
    .filter(h => h.dia === dia && h.activo)
    .map(h => ({ desde: h.desde, hasta: h.hasta }));
}

/**
 * ¿Entra el turno entero dentro de alguno de los bloques de ese día?
 *
 * Sin horarios cargados devuelve true a propósito: una operadora que
 * todavía no configuró nada tiene que poder anotar turnos igual.
 */
function estaDentroHorario(horarios, fecha, hora, duracion) {
  const bloques = normalizarHorarios(horarios);
  if (!bloques.length) return true;

  const delDia = bloquesDelDia(horarios, fecha);
  if (!delDia.length) return false;

  const inicio = toMin(hora);
  const fin    = inicio + Number(duracion || 0);
  return delDia.some(b => inicio >= toMin(b.desde) && fin <= toMin(b.hasta));
}

/**
 * Fecha y hora de ahora en la zona del negocio, como texto comparable.
 *
 * El servidor corre en UTC y Uruguay está 3 horas atrás: comparar contra
 * `new Date()` pelado haría que a las 22:00 de acá el servidor ya crea
 * que es mañana. Se comparan cadenas "YYYY-MM-DD" y "HH:MM", que en ese
 * formato se ordenan igual que las fechas.
 */
function ahoraEnZona(tz = 'America/Montevideo') {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});

  // Algunas versiones devuelven "24" para la medianoche.
  const hora = (p.hour === '24' ? '00' : p.hour) + ':' + p.minute;
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora };
}

/** ¿Ese día y esa hora ya pasaron? */
function yaPaso(fecha, hora, tz) {
  const ahora = ahoraEnZona(tz);
  const f = String(fecha).slice(0, 10);
  const h = String(hora).slice(0, 5);
  if (f < ahora.fecha) return true;
  if (f > ahora.fecha) return false;
  return h < ahora.hora;
}

module.exports = {
  toMin, diaSemanaNumero, normalizarHorarios, bloquesDelDia, estaDentroHorario,
  ahoraEnZona, yaPaso,
};
