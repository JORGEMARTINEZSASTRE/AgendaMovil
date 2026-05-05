'use strict';

// ── Estado global ────────────────────────────────
let fichaActual = {
  telefono: null,
  nombre:   null,
  turnoId:  null,
  fichaId:  null,
  esNueva:  true
};

// ── Abrir modal de ficha ─────────────────────────
async function abrirFicha(telefono, nombre, turnoId = null) {
  fichaActual = { telefono, nombre, turnoId, fichaId: null, esNueva: true };

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

  // Cargar ficha si existe
  try {
    const token = localStorage.getItem('token');
    const res   = await fetch(`/api/fichas/ficha/${encodeURIComponent(telefono)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.ficha) {
      fichaActual.fichaId = data.ficha.id;
      fichaActual.esNueva = false;
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
  const d = new Date(f + 'T00:00:00');
  return d.toLocaleDateString('es-UY', { day:'2-digit', month:'long', year:'numeric' });
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
    const token = localStorage.getItem('token');
    const res   = await fetch('/api/fichas/ficha', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    mostrarMensajeFicha('✅ Ficha guardada correctamente');
    fichaActual.esNueva = false;
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
  };

  try {
    const token = localStorage.getItem('token');
    const res   = await fetch('/api/fichas/sesion', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    // Limpiar campos sesión
    ['sesion-tratamiento','sesion-parametros','sesion-observaciones','sesion-profesional']
      .forEach(id => document.getElementById(id).value = '');

    // Recargar sesiones
    const res2  = await fetch(`/api/fichas/ficha/${encodeURIComponent(fichaActual.telefono)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data2 = await res2.json();
    renderSesiones(data2.sesiones || []);
    mostrarMensajeFicha('✅ Sesión registrada');
  } catch (err) {
    mostrarMensajeFicha('❌ ' + err.message, 'error');
  }
});

// ── Tabs click ───────────────────────────────────
document.querySelectorAll('.ficha-tab').forEach(btn => {
  btn.addEventListener('click', () => mostrarFichaTab(btn.dataset.ftab));
});

// ── Cerrar modal ─────────────────────────────────
document.getElementById('modal-ficha').querySelectorAll('.btn-cerrar-modal').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('modal-ficha').classList.add('oculto');
  });
});