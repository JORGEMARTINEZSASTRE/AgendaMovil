'use strict';

// Acciones de sucursales para operadoras con más de una ubicación.
// Agrega Activar / Desactivar / Borrar sin tocar el render principal de admin.js.
(function sucursalesActionsModule() {
  const API = window.API_URL || 'https://agendamovil.pro/api';
  const contenedorId = 'sucursales-admin';
  let sucursalesCache = [];
  let decorando = false;

  function token() {
    return localStorage.getItem('depimovil_token');
  }

  function toast(msg, tipo = 'exito') {
    if (typeof window.mostrarToast === 'function') {
      window.mostrarToast(msg, tipo);
      return;
    }
    alert(msg);
  }

  async function api(path, opciones = {}) {
    const resp = await fetch(`${API}${path}`, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token()}`,
        ...(opciones.headers || {}),
      },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) {
      throw new Error(data.error || `Error ${resp.status}`);
    }
    return data;
  }

  async function cargarSucursales() {
    const data = await api('/sucursales');
    sucursalesCache = Array.isArray(data.sucursales) ? data.sucursales : [];
    return sucursalesCache;
  }

  function buscarSucursal(id) {
    return sucursalesCache.find(s => String(s.id) === String(id));
  }

  function badgeEstado(activo) {
    return `<span class="badge ${activo ? 'badge-activa' : 'badge-inactiva'}" style="margin-left:8px;">${activo ? '✅ Activa' : '🔴 Inactiva'}</span>`;
  }

  function pintarEstadoCard(card, sucursal) {
    card.classList.toggle('sucursal-inactiva', !sucursal.activo);
    card.style.opacity = sucursal.activo ? '1' : '.58';
    card.style.filter = sucursal.activo ? '' : 'grayscale(.15)';

    const title = card.querySelector('h3');
    if (title && !title.querySelector('.badge')) {
      title.insertAdjacentHTML('beforeend', badgeEstado(sucursal.activo));
    }
  }

  function crearAcciones(card, sucursal) {
    if (card.querySelector('.sucursal-acciones-extra')) return;

    const head = card.querySelector('.sucursal-card-head');
    if (!head) return;

    const wrap = document.createElement('div');
    wrap.className = 'sucursal-acciones-extra';
    wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';

    const btnActivo = document.createElement('button');
    btnActivo.type = 'button';
    btnActivo.className = 'btn-admin btn-toggle-sucursal';
    btnActivo.dataset.id = sucursal.id;
    btnActivo.dataset.activo = String(sucursal.activo);
    btnActivo.textContent = sucursal.activo ? '🔴 Desactivar' : '✅ Activar';

    const btnBorrar = document.createElement('button');
    btnBorrar.type = 'button';
    btnBorrar.className = 'btn-admin btn-danger btn-borrar-sucursal';
    btnBorrar.dataset.id = sucursal.id;
    btnBorrar.dataset.nombre = sucursal.nombre || 'Sucursal';
    btnBorrar.textContent = '🗑 Borrar';

    wrap.append(btnActivo, btnBorrar);
    head.appendChild(wrap);
  }

  async function decorarSucursales() {
    if (decorando) return;
    const cont = document.getElementById(contenedorId);
    if (!cont) return;

    const cards = [...cont.querySelectorAll('.sucursal-card[data-sucursal-id]')];
    if (!cards.length) return;

    decorando = true;
    try {
      await cargarSucursales();

      cards.forEach(card => {
        const sucursal = buscarSucursal(card.dataset.sucursalId);
        if (!sucursal) return;
        pintarEstadoCard(card, sucursal);
        crearAcciones(card, sucursal);
      });
    } catch (err) {
      console.error('[sucursales-actions] decorar:', err.message);
    } finally {
      decorando = false;
    }
  }

  async function toggleSucursal(id, activoActual) {
    const proximoActivo = !activoActual;
    const accion = proximoActivo ? 'activar' : 'desactivar';

    if (!confirm(`¿Querés ${accion} esta sucursal?`)) return;

    try {
      await api(`/sucursales/${id}/activo`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: proximoActivo }),
      });
      toast(proximoActivo ? '✅ Sucursal activada' : '🔴 Sucursal desactivada');
      if (typeof window.cargarSucursalesAdmin === 'function') {
        await window.cargarSucursalesAdmin();
      }
      setTimeout(decorarSucursales, 100);
    } catch (err) {
      toast(err.message || 'No se pudo cambiar la sucursal', 'error');
    }
  }

  async function borrarSucursal(id, nombre) {
    const ok = confirm(
      `¿Querés borrar la sucursal "${nombre}"?\n\n` +
      'Si tiene turnos históricos, se va a desactivar para conservar la información.'
    );
    if (!ok) return;

    try {
      const data = await api(`/sucursales/${id}`, { method: 'DELETE' });
      toast(data.mensaje || 'Sucursal actualizada');
      if (typeof window.cargarSucursalesAdmin === 'function') {
        await window.cargarSucursalesAdmin();
      }
      setTimeout(decorarSucursales, 100);
    } catch (err) {
      toast(err.message || 'No se pudo borrar la sucursal', 'error');
    }
  }

  function bindDelegado() {
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('.btn-toggle-sucursal');
      if (toggle) {
        e.preventDefault();
        toggleSucursal(toggle.dataset.id, toggle.dataset.activo === 'true');
        return;
      }

      const borrar = e.target.closest('.btn-borrar-sucursal');
      if (borrar) {
        e.preventDefault();
        borrarSucursal(borrar.dataset.id, borrar.dataset.nombre || 'Sucursal');
      }
    });
  }

  function observarCambios() {
    const cont = document.getElementById(contenedorId);
    if (!cont) return;

    const observer = new MutationObserver(() => {
      setTimeout(decorarSucursales, 80);
    });
    observer.observe(cont, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindDelegado();
    observarCambios();
    setTimeout(decorarSucursales, 500);
  });
})();
