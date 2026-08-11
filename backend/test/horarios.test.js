'use strict';

/**
 * Horarios: los casos que ya rompieron en producción.
 *
 * Cada test de acá abajo existe porque algo se rompió de verdad, no por
 * completar cobertura. Si alguno se pone en rojo, es que volvimos a
 * separar en dos lugares una regla que tiene que ser una sola.
 *
 * Se corre con `npm test`. No necesita base de datos ni internet: estas
 * funciones son puras a propósito, justamente para poder probarlas.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  toMin, diaSemanaNumero, normalizarHorarios, bloquesDelDia,
  estaDentroHorario, ahoraEnZona, yaPaso,
} = require('../src/utils/horarios');

const MARTES = '2026-08-11';
const DOMINGO = '2026-08-16';

describe('toMin', () => {
  test('convierte HH:MM a minutos', () => {
    assert.equal(toMin('00:00'), 0);
    assert.equal(toMin('08:30'), 510);
    assert.equal(toMin('23:59'), 1439);
  });

  test('acepta la hora con segundos, como la devuelve Postgres', () => {
    // Una de las copias viejas rechazaba "16:00:00" y la otra no: el mismo
    // horario valía o no valía según por dónde entraras.
    assert.equal(toMin('16:00:00'), 960);
  });
});

describe('diaSemanaNumero', () => {
  test('0 es domingo y 6 es sábado, igual que Date.getDay()', () => {
    assert.equal(diaSemanaNumero(DOMINGO), 0);
    assert.equal(diaSemanaNumero(MARTES), 2);
    assert.equal(diaSemanaNumero('2026-08-15'), 6);
  });

  test('no se corre de día por la zona horaria', () => {
    // Con new Date('2026-08-11') pelado, en UTC-3 esto daba el día anterior.
    assert.equal(diaSemanaNumero('2026-08-11T00:00:00.000Z'), 2);
  });
});

describe('normalizarHorarios', () => {
  test('descarta lo que no es un horario', () => {
    assert.equal(normalizarHorarios(null).length, 0);
    assert.equal(normalizarHorarios('16:00').length, 0);
    // "99:99" pasaba el filtro viejo de la agenda pública, que usaba \d{2}.
    assert.equal(normalizarHorarios([{ dia: 2, desde: '99:99', hasta: '88:88' }]).length, 0);
    // Al revés tampoco: no se puede cerrar antes de abrir.
    assert.equal(normalizarHorarios([{ dia: 2, desde: '20:00', hasta: '16:00' }]).length, 0);
    assert.equal(normalizarHorarios([{ dia: 9, desde: '09:00', hasta: '12:00' }]).length, 0);
  });

  test('sin campo activo se asume que trabaja', () => {
    // Los horarios de profesional no traen esa columna. Si se asumiera
    // apagado, esas agendas quedarían sin un solo horario.
    const [b] = normalizarHorarios([{ dia: 2, desde: '09:00', hasta: '12:00' }]);
    assert.equal(b.activo, true);
  });

  test('acepta horas con segundos', () => {
    const [b] = normalizarHorarios([{ dia: 2, desde: '16:00:00', hasta: '22:00:00' }]);
    assert.equal(b.desde, '16:00');
    assert.equal(b.hasta, '22:00');
  });
});

describe('bloquesDelDia', () => {
  const semana = [
    { dia: 2, desde: '09:00', hasta: '12:00', activo: true },
    { dia: 2, desde: '15:00', hasta: '20:00', activo: true },
    { dia: 3, desde: '10:00', hasta: '18:00', activo: true },
  ];

  test('devuelve los dos tramos de un turno cortado', () => {
    assert.deepEqual(bloquesDelDia(semana, MARTES), [
      { desde: '09:00', hasta: '12:00' },
      { desde: '15:00', hasta: '20:00' },
    ]);
  });

  test('un día sin horario no devuelve nada', () => {
    assert.deepEqual(bloquesDelDia(semana, DOMINGO), []);
  });

  test('respeta el día apagado', () => {
    // La agenda pública ignoraba activo:false y ofrecía el día igual.
    const apagado = [{ dia: 2, desde: '09:00', hasta: '20:00', activo: false }];
    assert.deepEqual(bloquesDelDia(apagado, MARTES), []);
  });
});

describe('estaDentroHorario', () => {
  const cortado = [
    { dia: 2, desde: '09:00', hasta: '12:00', activo: true },
    { dia: 2, desde: '15:00', hasta: '20:00', activo: true },
  ];

  test('acepta un turno en el SEGUNDO tramo del turno cortado', () => {
    // El bug: el panel usaba horarios.find() y sólo miraba el primer
    // tramo, así que rechazaba las 16:00 mientras la agenda pública se
    // las ofrecía a la clienta.
    assert.equal(estaDentroHorario(cortado, MARTES, '16:00', 60), true);
  });

  test('acepta en el primer tramo', () => {
    assert.equal(estaDentroHorario(cortado, MARTES, '10:00', 60), true);
  });

  test('rechaza el hueco del mediodía', () => {
    assert.equal(estaDentroHorario(cortado, MARTES, '13:00', 30), false);
  });

  test('rechaza el turno que termina después del cierre', () => {
    assert.equal(estaDentroHorario(cortado, MARTES, '19:30', 60), false);
  });

  test('acepta el turno que termina justo en el cierre', () => {
    assert.equal(estaDentroHorario(cortado, MARTES, '19:00', 60), true);
  });

  test('sin horarios cargados deja anotar igual', () => {
    // Una operadora recién registrada tiene que poder usar la app.
    assert.equal(estaDentroHorario([], MARTES, '10:00', 30), true);
  });

  test('con horarios cargados pero ninguno ese día, rechaza', () => {
    assert.equal(estaDentroHorario(cortado, DOMINGO, '10:00', 30), false);
  });
});

describe('yaPaso', () => {
  test('el pasado es pasado', () => {
    assert.equal(yaPaso('2020-01-01', '10:00'), true);
  });

  test('el futuro no', () => {
    assert.equal(yaPaso('2099-01-01', '10:00'), false);
  });

  test('compara en hora de Montevideo, no en la del servidor', () => {
    // Railway corre en UTC, 3 horas adelante. Comparando contra la hora
    // del servidor, a las 22:00 de Uruguay ya sería "mañana" y se
    // rechazarían turnos válidos todas las noches.
    const hoyUY = ahoraEnZona('America/Montevideo').fecha;
    assert.equal(yaPaso(hoyUY, '00:00'), true);
    assert.equal(yaPaso(hoyUY, '23:59'), false);
  });

  test('ahoraEnZona devuelve formatos comparables como texto', () => {
    const a = ahoraEnZona();
    assert.match(a.fecha, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(a.hora, /^([01]\d|2[0-3]):[0-5]\d$/);
  });

  test('Montevideo va exactamente 3 horas atrás de UTC', () => {
    // Este es el test que agarra a alguien que vuelva a usar el reloj del
    // servidor. Sin él, cambiar la zona por la del sistema pasa
    // desapercibido: los otros casos están lejos del borde y siguen dando
    // bien aunque el reloj se corra tres horas.
    //
    // Uruguay no tiene horario de verano desde 2015. Si algún día lo
    // vuelve a tener, este test se pone en rojo y hay que decidir a
    // conciencia qué hacer — que es justamente lo que se busca.
    const enMinutos = ({ fecha, hora }) => {
      const [h, m] = hora.split(':').map(Number);
      return Date.UTC(...fecha.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v))) / 60000 + h * 60 + m;
    };
    const diferencia = enMinutos(ahoraEnZona('UTC')) - enMinutos(ahoraEnZona('America/Montevideo'));
    assert.equal(diferencia, 180, 'la hora no se está calculando en la zona del negocio');
  });
});
