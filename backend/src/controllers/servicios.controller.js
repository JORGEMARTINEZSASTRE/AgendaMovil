'use strict';

const { Servicios } = require('../models/queries');

async function listar(req, res) {
  try {
    const servicios = await Servicios.listar(req.user.id);
    return res.json({ ok: true, servicios, total: servicios.length });
  } catch (err) {
    console.error('[SERVICIOS/listar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener servicios' });
  }
}

async function obtener(req, res) {
  try {
    const servicio = await Servicios.buscarPorId(req.params.id, req.user.id);
    if (!servicio) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }
    return res.json({ ok: true, servicio });
  } catch (err) {
    console.error('[SERVICIOS/obtener]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener el servicio' });
  }
}

async function crear(req, res) {
  try {
   const { nombre, zona, duracion, color, descripcion, requiere_senia, monto_senia, categoria, precio } = req.body;

  const servicio = await Servicios.crear(req.user.id, {
  nombre, zona, duracion, color, descripcion,
  precio: parseFloat(precio) || 0,   // ← agregá
  requiereSenia: !!requiere_senia,
  montoSenia:    monto_senia || 0,
  categoria:     (categoria && categoria.trim()) || 'General',

});
    return res.status(201).json({ ok: true, mensaje: 'Servicio creado exitosamente', servicio });
  } catch (err) {
    console.error('[SERVICIOS/crear]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al crear el servicio' });
  }
}

async function actualizar(req, res) {
  try {
    const existente = await Servicios.buscarPorId(req.params.id, req.user.id);
    if (!existente) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }
    const { nombre, zona, duracion, color, descripcion, requiere_senia, monto_senia, categoria, precio } = req.body;

const servicio = await Servicios.actualizar(req.params.id, req.user.id, {
  nombre, zona, duracion, color, descripcion,
  precio: parseFloat(precio) || 0,   // ← agregá
  requiereSenia: !!requiere_senia,
  montoSenia:    monto_senia || 0,
  categoria:     (categoria && categoria.trim()) || 'General',
  });

    return res.json({ ok: true, mensaje: 'Servicio actualizado exitosamente', servicio });
  } catch (err) {
    console.error('[SERVICIOS/actualizar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al actualizar el servicio' });
  }
}

async function eliminar(req, res) {
  try {
    const eliminado = await Servicios.eliminar(req.params.id, req.user.id);
    if (!eliminado) {
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado' });
    }
    return res.json({ ok: true, mensaje: 'Servicio eliminado exitosamente' });
  } catch (err) {
    console.error('[SERVICIOS/eliminar]', err.message);
    return res.status(500).json({ ok: false, error: 'Error al eliminar el servicio' });
  }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };