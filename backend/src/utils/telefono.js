'use strict';

/**
 * Teléfonos: una sola versión de la verdad.
 *
 * Esto estaba escrito tres veces —acá, en evolution.service y en el
 * app.js del panel— y las tres hacían cosas distintas con el mismo
 * número. Lo que producía:
 *
 *   - El panel duplicaba el código de país. Si la operadora escribía
 *     "598 99 921 164" sin el '+', guardaba +598598999921164. El
 *     comentario viejo de este archivo decía haber arreglado ese bug,
 *     pero sólo se arregló del lado del servidor.
 *   - Un número argentino de 10 dígitos se guardaba como uruguayo
 *     (+598...) mientras que el WhatsApp salía al argentino (549...):
 *     se guardaba una persona y se le escribía a otra.
 *   - Un fijo uruguayo (8 dígitos que no empiezan con 9) se guardaba
 *     bien pero el WhatsApp salía sin código de país, así que no llegaba.
 *
 * Regla: siempre se decide sobre los dígitos limpios, nunca preguntando
 * si el texto traía '+', porque al limpiar los no-dígitos ese '+' ya no
 * está. Es lo que hacía que a un número que ya tenía 598 se le agregara
 * otro.
 */

/**
 * Devuelve el número en formato internacional con '+', que es como se
 * guarda en la base. Cadena vacía si no hay nada rescatable.
 */
function normalizarTelefono(raw, codigoPais = '598') {
  let tel = String(raw || '').replace(/\D/g, '');
  if (!tel) return '';

  // Formato internacional viejo: 00598...
  if (tel.startsWith('00')) tel = tel.slice(2);

  // Ya trae código de país.
  if (tel.startsWith('598') || tel.startsWith('54')) return '+' + tel;

  // Local con cero(s) inicial(es): 099921164 -> 99921164
  tel = tel.replace(/^0+/, '');
  if (!tel) return '';

  // Argentina: los móviles son 10 dígitos y llevan el 9 después del 54.
  // En Uruguay no hay números de 10 dígitos, así que no hay ambigüedad.
  if (tel.length === 10) return '+549' + tel;

  return '+' + String(codigoPais).replace(/\D/g, '') + tel;
}

/**
 * El mismo número pero sin '+', que es como lo quiere Evolution para
 * mandar WhatsApp. Antes esto era otra función con sus propias reglas.
 */
function telefonoParaWhatsApp(raw, codigoPais = '598') {
  return normalizarTelefono(raw, codigoPais).replace('+', '');
}

module.exports = { normalizarTelefono, telefonoParaWhatsApp };
