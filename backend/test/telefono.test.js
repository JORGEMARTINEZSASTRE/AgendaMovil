'use strict';

/**
 * Teléfonos: los casos que ya ensuciaron la base.
 *
 * El último test es el más importante de todos: compara la versión del
 * servidor con la copia que corre en el navegador. Esa copia existe
 * porque el panel es un script suelto sin bundler, así que la única
 * forma de que no se separen otra vez es que algo se ponga en rojo
 * cuando alguien toca una sola de las dos.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { normalizarTelefono, telefonoParaWhatsApp } = require('../src/utils/telefono');

// La copia del navegador se carga tal cual está publicada.
const srcNavegador = fs.readFileSync(path.join(__dirname, '../public/telefono.js'), 'utf8');
const normalizarEnElNavegador = new Function(srcNavegador + '; return normalizarTelefono;')();

// Todas las formas en que una operadora escribe el mismo número.
const CASOS = [
  ['099 921 164',    '+59899921164'],
  ['099921164',      '+59899921164'],
  ['99921164',       '+59899921164'],
  ['+59899921164',   '+59899921164'],
  ['+598 99 921 164','+59899921164'],
  ['59899921164',    '+59899921164'],   // el 598 escrito a mano, sin '+'
  ['598 99 921 164', '+59899921164'],
  ['0059899921164',  '+59899921164'],   // formato internacional viejo
  ['0099921164',     '+59899921164'],
  ['00099921164',    '+59899921164'],
  ['4712 3456',      '+59847123456'],   // fijo uruguayo
];

describe('normalizarTelefono', () => {
  for (const [escrito, esperado] of CASOS) {
    test(`"${escrito}" -> ${esperado}`, () => {
      assert.equal(normalizarTelefono(escrito), esperado);
    });
  }

  test('NO duplica el código de país', () => {
    // El bug: se preguntaba si el texto empezaba con '+', pero al limpiar
    // los no-dígitos ese '+' ya no estaba, así que a un número que ya
    // traía 598 se le agregaba otro y quedaba +59859899921164.
    assert.equal(normalizarTelefono('59899921164'), '+59899921164');
    assert.equal(normalizarTelefono('598 99 921 164'), '+59899921164');
    assert.ok(!normalizarTelefono('59899921164').startsWith('+598598'));
  });

  test('un móvil argentino queda argentino', () => {
    // Se guardaba como uruguayo (+598...) mientras el WhatsApp salía al
    // argentino (549...): se archivaba una persona y se le escribía a otra.
    assert.equal(normalizarTelefono('1112345678'), '+5491112345678');
    assert.equal(normalizarTelefono('+5491112345678'), '+5491112345678');
  });

  test('lo que no es un teléfono devuelve vacío', () => {
    assert.equal(normalizarTelefono(''), '');
    assert.equal(normalizarTelefono(null), '');
    assert.equal(normalizarTelefono('abc'), '');
    assert.equal(normalizarTelefono('0'), '');
  });

  test('es idempotente: normalizar dos veces no cambia nada', () => {
    for (const [escrito] of CASOS) {
      const una = normalizarTelefono(escrito);
      assert.equal(normalizarTelefono(una), una, `se rompe al repetir con "${escrito}"`);
    }
  });
});

describe('telefonoParaWhatsApp', () => {
  test('es el mismo número que se guarda, sin el +', () => {
    // Antes eran dos funciones con reglas propias: el WhatsApp podía
    // salir a un número distinto del que estaba en la ficha.
    for (const [escrito] of CASOS) {
      assert.equal(
        telefonoParaWhatsApp(escrito),
        normalizarTelefono(escrito).replace('+', ''),
        `no coinciden para "${escrito}"`
      );
    }
  });

  test('un fijo uruguayo sale con código de país', () => {
    // La versión vieja lo mandaba como "47123456" y no llegaba nunca.
    assert.equal(telefonoParaWhatsApp('4712 3456'), '59847123456');
  });
});

describe('la copia del navegador no se separó de la del servidor', () => {
  const entradas = [
    ...CASOS.map(c => c[0]),
    '', null, 'abc', '0', '1112345678', '+5491112345678', '  099921164  ',
    '099-921-164', '(099) 921 164', '598', '5', '000',
  ];

  for (const entrada of entradas) {
    test(`coinciden con ${JSON.stringify(entrada)}`, () => {
      assert.equal(
        normalizarEnElNavegador(entrada),
        normalizarTelefono(entrada),
        'public/telefono.js quedó distinto de src/utils/telefono.js'
      );
    });
  }
});
