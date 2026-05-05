'use strict';

// ── Estado global ────────────────────────────────
let fichaActual = {
  telefono: null,
  nombre:   null,
  turnoId:  null,
  fichaId:  null,
  esNueva:  true,
  guardado: true
};

// ── Abrir modal de ficha ─────────────────────────
async function abrirFicha(telefono, nombre, turnoId = null) {
  fichaActual = { telefono, nombre, turnoId, fichaId: null, esNueva: true, guardado: false };

  // Info clienta
  document.getElementById('ficha-clienta-info').innerHTML = `
    <div>
      <p class="ficha-clienta-nombre">👤 ${nombre}</p>
      <p class="ficha-clienta-tel">📞 ${telefono}</p>
    </div>
    <span class="ficha-clienta-badge nueva" id="ficha-estado-badge">Nueva ficha</span>
  `;

  // Limpiar form
  document.getElementById('form-ficha').reset();
  document.getElementById('ficha-sesiones-lista').innerHTML = '';
  mostrarFichaTab('datos');
  ocultarMensajeFicha();
  document.getElementById('modal-ficha-confirmar').classList.add('oculto');

  // Cargar ficha si existe
  try {
    const token = localStorage.getItem('depimovil_token');
    const res   = await fetch(`/api/fichas/ficha/${encodeURIComponent(telefono)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.ficha) {
      fichaActual.fichaId = data.ficha.id;
      fichaActual.esNueva = false;
      fichaActual.guardado = true;
      rellenarFormFicha(data.ficha);
      renderSesiones(data.sesiones || []);
      document.getElementById('ficha-estado-badge').textContent = '✅ Ficha existente';
      document.getElementById('ficha-estado-badge').classList.remove('nueva');
    } else {
      // Pre-rellenar nombre y teléfono
      const form = document.getElementById('form-ficha');
      form.querySelector('[name="nombre"]').value  = nombre || '';
      renderSesiones([]);
    }
  } catch (e) {
    console.error('[FICHA]', e);
  }

  document.getElementById('modal-ficha').classList.remove('oculto');
}

// ── Rellenar form con datos de la ficha ──────────
function rellenarFormFicha(ficha) {
  const form = document.getElementById('form-ficha');
  Object.entries(ficha).forEach(([key, val]) => {
    const el = form.querySelector(`[name="${key}"]`);
    if (el && val !== null && val !== undefined) el.value = val;
  });
}

// ── Renderizar sesiones ──────────────────────────
function renderSesiones(sesiones) {
  const lista = document.getElementById('ficha-sesiones-lista');
  if (!sesiones.length) {
    lista.innerHTML = '<p class="sesion-vacio">Sin sesiones registradas aún.</p>';
    return;
  }
  lista.innerHTML = sesiones.map(s => `
    <div class="sesion-card">
      <p class="sesion-fecha">
        📅 ${s.turno_fecha ? formatearFecha(s.turno_fecha) : formatearFecha(s.fecha)}
        ${s.turno_hora ? '— ' + s.turno_hora.slice(0,5) + ' hs' : ''}
        ${s.servicio_nombre ? '· ' + s.servicio_nombre : ''}
      </p>
      ${s.tratamiento   ? `<p class="sesion-campo"><strong>Tratamiento:</strong> ${s.tratamiento}</p>` : ''}
      ${s.parametros    ? `<p class="sesion-campo"><strong>Parámetros:</strong> ${s.parametros}</p>` : ''}
      ${s.observaciones ? `<p class="sesion-campo"><strong>Observaciones:</strong> ${s.observaciones}</p>` : ''}
      ${s.profesional   ? `<p class="sesion-campo"><strong>Profesional:</strong> ${s.profesional}</p>` : ''}
    </div>
  `).join('');
}

function formatearFecha(f) {
  if (!f) return '';
  const raw = String(f);
  const dateStr = raw.split('T')[0];
  if (!dateStr || dateStr.length < 10) return '';
  const [a, m, d] = dateStr.split('-').map(Number);
  if (!a || !m || !d) return '';
  const fecha = new Date(a, m - 1, d);
  if (isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-UY', { day:'2-digit', month:'long', year:'numeric' });
}

// ── Tabs ─────────────────────────────────────────
function mostrarFichaTab(tab) {
  document.querySelectorAll('.ficha-tab').forEach(b => {
    b.classList.toggle('activo', b.dataset.ftab === tab);
  });
  document.querySelectorAll('.ficha-panel').forEach(p => {
    p.classList.toggle('activo', p.dataset.fpanel === tab);
  });
  // Ocultar footer guardar en tab sesiones
  const footer = document.getElementById('ficha-footer-guardar');
  if (footer) footer.style.display = tab === 'sesiones' ? 'none' : 'block';
}

// ── Mensaje feedback ─────────────────────────────
function mostrarMensajeFicha(texto, tipo = 'ok') {
  const el = document.getElementById('ficha-msg');
  el.textContent = texto;
  el.className   = `ficha-msg ${tipo}`;
  el.classList.remove('oculto');
  setTimeout(() => el.classList.add('oculto'), 3500);
}
function ocultarMensajeFicha() {
  const el = document.getElementById('ficha-msg');
  if (el) el.classList.add('oculto');
}

// ── Guardar ficha ────────────────────────────────
document.getElementById('form-ficha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form   = e.target;
  const inputs = form.querySelectorAll('input, textarea, select');
  const data   = { telefono: fichaActual.telefono };
  inputs.forEach(el => {
    if (el.name) data[el.name] = el.value || null;
  });

  try {
    const token = localStorage.getItem('depimovil_token');
    const res   = await fetch('/api/fichas/ficha', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    // Si es nueva, buscar el id recién creado
    if (result.accion === 'creada' && result.id) {
      fichaActual.fichaId = result.id;
    } else if (result.accion === 'actualizada' && !fichaActual.fichaId) {
      // Buscar el id si no lo teníamos
      const r2 = await fetch(`/api/fichas/ficha/${encodeURIComponent(fichaActual.telefono)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d2 = await r2.json();
      if (d2.ficha) fichaActual.fichaId = d2.ficha.id;
    }

    fichaActual.esNueva = false;
    fichaActual.guardado = true;
    mostrarMensajeFicha('✅ Ficha guardada correctamente');
    document.getElementById('ficha-estado-badge').textContent = '✅ Ficha existente';
    document.getElementById('ficha-estado-badge').classList.remove('nueva');

  } catch (err) {
    mostrarMensajeFicha('❌ Error al guardar: ' + err.message, 'error');
  }
});

// ── Guardar sesión ───────────────────────────────
document.getElementById('btn-guardar-sesion').addEventListener('click', async () => {
  if (!fichaActual.fichaId) {
    mostrarMensajeFicha('⚠️ Primero guardá la ficha antes de agregar una sesión.', 'error');
    mostrarFichaTab('datos');
    return;
  }

  const data = {
    ficha_id:      fichaActual.fichaId,
    turno_id:      fichaActual.turnoId,
    tratamiento:   document.getElementById('sesion-tratamiento').value,
    parametros:    document.getElementById('sesion-parametros').value,
    observaciones: document.getElementById('sesion-observaciones').value,
    profesional:   document.getElementById('sesion-profesional').value,
    proxima_fecha: document.getElementById('sesion-proxima-fecha').value || null,
    proxima_hora:  document.getElementById('sesion-proxima-hora').value || null,
  };

  try {
    const token = localStorage.getItem('depimovil_token');
    const res   = await fetch('/api/fichas/sesion', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    // Limpiar campos sesión
    ['sesion-tratamiento','sesion-parametros','sesion-observaciones','sesion-profesional',
     'sesion-proxima-fecha','sesion-proxima-hora']
      .forEach(id => document.getElementById(id).value = '');

    // Recargar sesiones
    const res2  = await fetch(`/api/fichas/ficha/${encodeURIComponent(fichaActual.telefono)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data2 = await res2.json();
    renderSesiones(data2.sesiones || []);

    // Recargar turnos de la agenda si se programó próxima fecha
    if (data.proxima_fecha && data.proxima_hora) {
      try {
        const resTurnos = await fetch('/api/turnos', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const turnosData = await resTurnos.json();
        if (turnosData.turnos && typeof turnos !== 'undefined') {
          turnos = turnosData.turnos;
        }
        if (typeof renderAgenda === 'function') {
          renderAgenda();
        }
      } catch (e) {
        console.error('[FICHA] Error al recargar turnos:', e);
      }
    }

    mostrarMensajeFicha('✅ Sesión registrada' + (data.proxima_fecha ? ' — próxima sesión agendada' : ''));
  } catch (err) {
    mostrarMensajeFicha('❌ ' + err.message, 'error');
  }
});

// ── Tabs click ───────────────────────────────────
document.querySelectorAll('.ficha-tab').forEach(btn => {
  btn.addEventListener('click', () => mostrarFichaTab(btn.dataset.ftab));
});

// Marcar como no guardado al modificar campos
document.getElementById('form-ficha').addEventListener('input', () => {
  fichaActual.guardado = false;
});

// ── Cerrar modal con confirmación ────────────────
function pedirConfirmacionSalir() {
  if (fichaActual.guardado) {
    cerrarFichaModal();
    return;
  }
  document.getElementById('modal-ficha-confirmar').classList.remove('oculto');
}
function cerrarFichaModal() {
  document.getElementById('modal-ficha').classList.add('oculto');
  document.getElementById('modal-ficha-confirmar').classList.add('oculto');
}

// Botón X en el modal ficha
document.getElementById('modal-ficha').querySelectorAll('.btn-cerrar-modal').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    pedirConfirmacionSalir();
  });
});

// Botón Cancelar en el footer
const btnCancelar = document.getElementById('btn-cancelar-ficha');
if (btnCancelar) {
  btnCancelar.addEventListener('click', pedirConfirmacionSalir);
}

// Botones del modal de confirmación
document.getElementById('btn-ficha-seguir').addEventListener('click', () => {
  document.getElementById('modal-ficha-confirmar').classList.add('oculto');
});
document.getElementById('btn-ficha-salir').addEventListener('click', cerrarFichaModal);

// Prevenir cierre al tocar fuera del modal
document.getElementById('modal-ficha').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-ficha')) {
    e.preventDefault();
    pedirConfirmacionSalir();
  }
});
document.getElementById('modal-ficha-confirmar').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-ficha-confirmar')) {
    document.getElementById('modal-ficha-confirmar').classList.add('oculto');
  }
});

// ── Drag-to-scroll en tabs (PC con mouse) ────────
const tabsContainer = document.querySelector('.ficha-tabs');
if (tabsContainer) {
  let isDown = false;
  let startX;
  let scrollLeft;

  tabsContainer.addEventListener('mousedown', (e) => {
    isDown = true;
    tabsContainer.style.cursor = 'grabbing';
    startX = e.pageX - tabsContainer.offsetLeft;
    scrollLeft = tabsContainer.scrollLeft;
  });

  tabsContainer.addEventListener('mouseleave', () => {
    isDown = false;
    tabsContainer.style.cursor = '';
  });

  tabsContainer.addEventListener('mouseup', () => {
    isDown = false;
    tabsContainer.style.cursor = '';
  });

  tabsContainer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - tabsContainer.offsetLeft;
    const walk = (x - startX) * 1.5;
    tabsContainer.scrollLeft = scrollLeft - walk;
  });
}