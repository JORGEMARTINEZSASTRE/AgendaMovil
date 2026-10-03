'use strict';

/**
 * Prueba de punta a punta con usuarias FALSAS contra un servidor local.
 *
 * NO se corre contra producción: necesita una base de prueba vacía.
 * Uso:   BASE=http://localhost:3999 node --test backend/test/e2e/agenda.e2e.js
 *
 * Cubre los casos que trabaron a operadoras reales:
 *  - Una usuaria nueva (como Sol) tiene que poder agendar sin crear
 *    ninguna sucursal a mano.
 *  - Una clienta tiene que poder reservar por el link público aunque la
 *    operadora nunca haya abierto la app.
 *  - Turnos hasta las 23:30.
 *  - Con varias ubicaciones, cada una tiene su agenda separada.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.BASE || 'http://localhost:3999';
const API  = BASE + '/api';
const RUN  = Date.now().toString(36);

// Un martes dentro de ~2 semanas, en formato YYYY-MM-DD
function proximoDia(diaSemana, minDias = 7) {
  const d = new Date();
  d.setDate(d.getDate() + minDias);
  while (d.getDay() !== diaSemana) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
const MARTES  = proximoDia(2);
const DOMINGO = proximoDia(0);

async function api(path, { token, method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

let telSeq = 100000;
function telefono() { return '0991' + String(telSeq++).slice(-5); }

async function nuevaUsuaria(nombre) {
  const email = `${nombre.toLowerCase()}.${RUN}@test.local`;
  const password = 'clave-de-prueba-123';
  const reg = await api('/publica/registro', {
    method: 'POST',
    body: { nombre, email, password, telefono: '099123456', codigo_pais: '+598' },
  });
  assert.ok(reg.status < 300, `registro falló: ${reg.status} ${JSON.stringify(reg.data)}`);
  const login = await api('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200, 'login: ' + JSON.stringify(login.data));
  const token = login.data.token;
  const me = await api('/auth/me', { token });
  const id = me.data?.usuario?.id || me.data?.user?.id || me.data?.id || login.data?.usuario?.id;
  assert.ok(id, 'no pude leer el id de la usuaria: ' + JSON.stringify(me.data));
  return { token, id, email };
}

function turno(extra = {}) {
  return {
    nombre: 'Clienta Prueba',
    telefono: telefono(),
    fecha: MARTES,
    hora: '10:00',
    duracion: 30,
    ...extra,
  };
}

// ───────────────────────────────────────────────────────────────
describe('Usuaria nueva que trabaja sola (caso Sol)', () => {
  let u, principal;

  before(async () => { u = await nuevaUsuaria('Sol'); });

  test('al entrar ya tiene una ubicación "Principal", sin crear nada', async () => {
    const r = await api('/sucursales', { token: u.token });
    assert.equal(r.status, 200);
    const activas = r.data.sucursales.filter(s => s.activo !== false);
    assert.equal(activas.length, 1);
    assert.equal(activas[0].nombre, 'Principal');
    principal = activas[0];
  });

  test('entrar varias veces no duplica la Principal', async () => {
    await Promise.all([1, 2, 3].map(() => api('/sucursales', { token: u.token })));
    const r = await api('/sucursales', { token: u.token });
    assert.equal(r.data.sucursales.length, 1);
  });

  test('puede agendar un turno', async () => {
    const r = await api('/turnos', { token: u.token, method: 'POST',
      body: turno({ sucursal_id: principal.id }) });
    assert.ok(r.status < 300, JSON.stringify(r.data));
  });

  test('puede agendar a las 21:00 y a las 23:30', async () => {
    for (const hora of ['21:00', '23:30']) {
      const r = await api('/turnos', { token: u.token, method: 'POST',
        body: turno({ sucursal_id: principal.id, hora }) });
      assert.ok(r.status < 300, `${hora}: ${JSON.stringify(r.data)}`);
    }
  });

  test('no deja pisar un turno ya agendado', async () => {
    const r = await api('/turnos', { token: u.token, method: 'POST',
      body: turno({ sucursal_id: principal.id, hora: '10:15' }) });
    assert.equal(r.status >= 400, true, 'aceptó un turno superpuesto');
  });

  test('guarda su horario de trabajo', async () => {
    const horarios = [1, 2, 3, 4, 5].map(dia => ({ dia, desde: '09:00', hasta: '18:00', activo: true }));
    const r = await api(`/sucursales/${principal.id}/horarios`, { token: u.token, method: 'PUT', body: { horarios } });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    const g = await api(`/sucursales/${principal.id}/horarios`, { token: u.token });
    assert.equal(g.data.sucursal.horarios.length, 5);
  });

  test('ve sus turnos del día', async () => {
    const r = await api(`/turnos?fecha=${MARTES}`, { token: u.token });
    assert.equal(r.status, 200);
    const lista = r.data.turnos || r.data;
    assert.equal(lista.length, 3);
  });

  describe('Agenda pública de Sol', () => {
    test('muestra una sola ubicación (el paso se saltea)', async () => {
      const r = await api(`/publica/${u.id}/sucursales`);
      assert.equal(r.data.sucursales.length, 1);
    });

    test('ofrece horarios del martes y respeta los ocupados', async () => {
      const r = await api(`/publica/${u.id}/disponibilidad?fecha=${MARTES}&sucursal_id=${principal.id}`);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.ok(r.data.tieneHorario);
      assert.ok(r.data.bloques.length > 0);
    });

    test('el domingo no trabaja: no hay bloques', async () => {
      const r = await api(`/publica/${u.id}/disponibilidad?fecha=${DOMINGO}&sucursal_id=${principal.id}`);
      assert.equal(r.data.bloques.length, 0);
    });

    test('una clienta reserva por el link', async () => {
      const r = await api(`/publica/${u.id}/turno`, { method: 'POST',
        body: { nombre: 'Clienta Link', telefono: telefono(), fecha: MARTES, hora: '14:00',
                duracion: 30, sucursal_id: principal.id } });
      assert.ok(r.status < 300, JSON.stringify(r.data));
    });

    test('otra clienta NO puede reservar el mismo horario', async () => {
      const r = await api(`/publica/${u.id}/turno`, { method: 'POST',
        body: { nombre: 'Clienta Doble', telefono: telefono(), fecha: MARTES, hora: '14:00',
                duracion: 30, sucursal_id: principal.id } });
      assert.ok(r.status >= 400, 'aceptó una reserva duplicada');
    });
  });
});

// ───────────────────────────────────────────────────────────────
describe('Operadora que nunca abrió la app', () => {
  test('su clienta igual puede reservar por el link público', async () => {
    const u = await nuevaUsuaria('Nunca');
    // Ojo: nuevaUsuaria solo se loguea, no llama a /sucursales.
    const s = await api(`/publica/${u.id}/sucursales`);
    assert.equal(s.data.sucursales.length, 1, JSON.stringify(s.data));
    const r = await api(`/publica/${u.id}/turno`, { method: 'POST',
      body: { nombre: 'Clienta', telefono: telefono(), fecha: MARTES, hora: '11:00',
              duracion: 30, sucursal_id: s.data.sucursales[0].id } });
    assert.ok(r.status < 300, JSON.stringify(r.data));
  });

  test('un id de usuaria inventado no crea nada ni explota', async () => {
    const r = await api('/publica/00000000-0000-0000-0000-000000000000/sucursales');
    assert.equal(r.status, 200);
    assert.equal(r.data.sucursales.length, 0);
    const basura = await api('/publica/no-es-un-uuid/sucursales');
    assert.ok(basura.status < 500, 'id basura dio error 500');
  });
});

// ───────────────────────────────────────────────────────────────
describe('Operadora con dos locales', () => {
  let u, a, b;

  before(async () => {
    u = await nuevaUsuaria('Dos');
    a = (await api('/sucursales', { token: u.token })).data.sucursales[0];
    const r = await api('/sucursales', { token: u.token, method: 'POST',
      body: { nombre: 'Local Centro', tipo: 'sucursal', max_turnos_hora: 1 } });
    assert.ok(r.data.ok, JSON.stringify(r.data));
    b = r.data.sucursal;
  });

  test('ahora tiene 2 ubicaciones y no se crea otra Principal', async () => {
    const r = await api('/sucursales', { token: u.token });
    assert.equal(r.data.sucursales.length, 2);
  });

  test('el mismo horario en locales distintos no choca', async () => {
    const r1 = await api('/turnos', { token: u.token, method: 'POST', body: turno({ sucursal_id: a.id, hora: '15:00' }) });
    const r2 = await api('/turnos', { token: u.token, method: 'POST', body: turno({ sucursal_id: b.id, hora: '15:00' }) });
    assert.ok(r1.status < 300, JSON.stringify(r1.data));
    assert.ok(r2.status < 300, JSON.stringify(r2.data));
  });

  test('en el mismo local sí choca', async () => {
    const r = await api('/turnos', { token: u.token, method: 'POST', body: turno({ sucursal_id: b.id, hora: '15:10' }) });
    assert.ok(r.status >= 400, 'aceptó turno superpuesto en el mismo local');
  });

  test('la agenda pública muestra las 2 para elegir', async () => {
    const r = await api(`/publica/${u.id}/sucursales`);
    assert.equal(r.data.sucursales.length, 2);
  });

  test('borrar el segundo local (con turnos) lo desactiva y no aparece en público', async () => {
    const r = await api(`/sucursales/${b.id}`, { token: u.token, method: 'DELETE' });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    const pub = await api(`/publica/${u.id}/sucursales`);
    assert.equal(pub.data.sucursales.length, 1);
  });
});

// ───────────────────────────────────────────────────────────────
describe('Operadora que trabaja solo con profesionales', () => {
  let u, prof;

  before(async () => {
    u = await nuevaUsuaria('Prof');
    const r = await api('/profesionales', { token: u.token, method: 'POST',
      body: { nombre: 'Ana', color: '#A85568' } });
    assert.ok(r.status < 300, JSON.stringify(r.data));
    prof = r.data.profesional || r.data;
  });

  test('la agenda pública ofrece a la profesional', async () => {
    const r = await api(`/publica/${u.id}/sucursales`);
    const ids = r.data.sucursales.map(s => s.id);
    assert.ok(ids.includes(prof.id), JSON.stringify(r.data));
  });

  test('una clienta reserva con la profesional', async () => {
    const r = await api(`/publica/${u.id}/turno`, { method: 'POST',
      body: { nombre: 'Clienta Ana', telefono: telefono(), fecha: MARTES, hora: '12:00',
              duracion: 30, sucursal_id: prof.id } });
    assert.ok(r.status < 300, JSON.stringify(r.data));
  });

  test('la operadora puede agendar desde el panel', async () => {
    const s = await api('/sucursales', { token: u.token });
    const sucId = s.data.sucursales[0]?.id || null;
    const r = await api('/turnos', { token: u.token, method: 'POST',
      body: turno({ hora: '16:00', sucursal_id: sucId }) });
    assert.ok(r.status < 300, JSON.stringify(r.data));
  });
});
