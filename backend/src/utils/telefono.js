'use strict';

/**
 * Normaliza un telefono a formato internacional: +598... o +54...
 *
 * Ojo con el bug historico que esto viene a corregir: no alcanza con
 * preguntar si el texto trae '+', porque al limpiar los no-digitos ese
 * '+' ya desaparecio. Hay que detectar el codigo de pais sobre los
 * digitos limpios; si no, a un numero que ya traia 598 se le agrega otro
 * y queda +59859899921164, que WhatsApp rechaza.
 *
 * Misma logica que normalizarTelefono() de evolution.service, pero
 * devolviendo el '+' inicial porque asi se guarda en la base.
 */
function normalizarTelefono(raw, codigoPais = '598') {
  let tel = String(raw || '').replace(/\D/g, '');
  if (!tel) return '';

  // Formato internacional viejo: 00598...
  if (tel.startsWith('00')) tel = tel.slice(2);

  // Ya trae codigo de pais
  if (tel.startsWith('598') || tel.startsWith('54')) return '+' + tel;

  // Local con 0 inicial: 099921164 -> 99921164
  tel = tel.replace(/^0+/, '');
  if (!tel) return '';

  return '+' + String(codigoPais).replace(/\D/g, '') + tel;
}

module.exports = { normalizarTelefono };
