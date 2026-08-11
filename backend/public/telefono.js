'use strict';

/**
 * Teléfonos, versión navegador.
 *
 * Es la MISMA lógica que backend/src/utils/telefono.js. Está duplicada
 * a mano porque estas páginas son scripts sueltos, sin bundler ni
 * módulos: no hay forma de importar el archivo del servidor. Si tocás
 * uno, tocá el otro.
 *
 * Lo que arregla respecto de la versión que vivía dentro de app.js:
 * aquella preguntaba si el texto empezaba con '+' para decidir, pero
 * como los no-dígitos ya se habían borrado, un número escrito como
 * "598 99 921 164" (sin '+') terminaba guardado como +59859899921164,
 * con el código de país dos veces.
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

  // Argentina: los móviles son 10 dígitos. En Uruguay no hay números de
  // 10 dígitos, así que no hay ambigüedad.
  if (tel.length === 10) return '+549' + tel;

  return '+' + String(codigoPais).replace(/\D/g, '') + tel;
}
