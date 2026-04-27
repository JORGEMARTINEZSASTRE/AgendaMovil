'use strict';

// ═══════════════════════════════════════════════════════════
//  APP.JS — DEPIMÓVIL PRO
//  Versión SaaS — consume API REST con JWT
// ═══════════════════════════════════════════════════════════

// ─── ESTADO EN MEMORIA ───────────────────────────────────────
let turnos    = [];
let servicios = [];
let config    = {
  plantilla_turno:  '',
  plantilla_cumple: '',
};

let tabActual         = 'agenda';
let fechaSeleccionada = hoy();
let editandoId        = null;
let editandoServId    = null;
let mesCalendario     = new Date();
let cargando          = false;

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const acceso = await verificarAcceso();
  if (!acceso) return;

  mostrarInfoUsuario();
  await cargarDatosIniciales();
  initUI();
  bindBtnConectarWhatsApp();
  mostrarApp();

  // Mostrar botón admin si es admin
  const usuario = Sesion.getUsuario();
  if (usuario?.rol === 'admin') {
    const btnAdmin = document.getElementById('btn-ir-admin');
    if (btnAdmin) {
      btnAdmin.style.display = 'flex';
      btnAdmin.addEventListener('click', () => {
        window.location.href = '/admin.html';
      });
    }
  }
});

// ─── LIMPIAR DATOS EN MEMORIA ────────────────────────────────
function limpiarDatosEnMemoria() {
  turnos    = [];
  servicios = [];
  config    = { plantilla_turno: '', plantilla_cumple: '' };
}

// ═══════════════════════════════════════════════════════════
//  CARGA INICIAL
// ═══════════════════════════════════════════════════════════
async function cargarDatosIniciales() {
  mostrarCargando(true);
  try {
    const [turnosData, serviciosData, configData] = await Promise.all([
      apiCall(() => TurnosAPI.getAll(),    'Error al cargar turnos'),
      apiCall(() => ServiciosAPI.getAll(), 'Error al cargar servicios'),
      apiCall(() => ConfigAPI.get(),       'Error al cargar configuración'),
    ]);

    turnos    = turnosData    || [];
    servicios = serviciosData || [];

    if (configData) {
      config.plantilla_turno  = configData.plantilla_turno;
      config.plantilla_cumple = configData.plantilla_cumple;
    }
  } catch (err) {
    console.error('[cargarDatosIniciales]', err);
    mostrarToast('Error al cargar datos. Recargá la página.', 'error');
  } finally {
    mostrarCargando(false);
  }
}

// ═══════════════════════════════════════════════════════════
//  INFO USUARIO
// ═══════════════════════════════════════════════════════════
function mostrarInfoUsuario() {
  const usuario = Sesion.getUsuario();
  if (!usuario) return;

  const nombreEl = document.getElementById('usuario-nombre');
  if (nombreEl) {
    nombreEl.textContent = usuario.nombre_negocio || usuario.nombre || 'Mi Agenda';
  }

  const planEl = document.getElementById('usuario-plan');
  if (planEl) {
    const esPremium     = usuario.plan === 'premium';
    planEl.textContent  = esPremium ? '⭐ Premium' : '🕐 Trial';
    planEl.className    = `plan-badge ${esPremium ? 'premium' : 'trial'}`;
  }

  const dias        = Sesion.diasTrial();
  const trialInfoEl = document.getElementById('trial-info');
  if (trialInfoEl && dias !== null) {
    if (dias <= 5) {
      trialInfoEl.textContent = `⚠️ Trial: ${dias} día${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}`;
      trialInfoEl.classList.remove('oculto');
      trialInfoEl.style.color = dias === 0 ? 'var(--rojo)' : 'var(--dorado)';
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  INIT UI
// ═══════════════════════════════════════════════════════════
function initUI() {
  bindTabs();
  bindFormTurno();
  bindFormServicio();
  bindBotonesHeader();
  bindConfiguracion();
  bindBtnConectarWhatsApp();
  renderTabActual();
  inicializarWaPendientes(); 
  const inputBuscarServ = document.getElementById('buscar-servicio');
  
  if (inputBuscarServ) {
    inputBuscarServ.addEventListener('input', () => {
      renderServicios();
    });
  }
}

function mostrarApp() {
  const splash     = document.getElementById('pantalla-splash');
  const bienvenida = document.getElementById('pantalla-bienvenida');
  const principal  = document.getElementById('pantalla-principal');

  if (splash)     splash.style.display     = 'none';
  if (bienvenida) bienvenida.style.display = 'none';
  if (principal)  principal.style.display  = 'flex';
}

// ═══════════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════════
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === tabActual) return;
      tabActual = tab;

      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('activo', b.dataset.tab === tab);
      });
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('activo', p.dataset.panel === tab);
      });

      renderTabActual();
    });
  });
}

function renderTabActual() {
  switch (tabActual) {
    case 'agenda':     renderAgenda();     break;
    case 'calendario': renderCalendario(); break;
    case 'servicios':  renderServicios();  break;
    case 'cumples':    renderCumples();    break;
  }
}

// ═══════════════════════════════════════════════════════════
//  BOTONES HEADER
// ═══════════════════════════════════════════════════════════
function bindBotonesHeader() {
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('¿Cerrar sesión?')) AuthAPI.logout();
    });
  }

  const btnNuevo = document.getElementById('btn-nuevo-turno');
  if (btnNuevo) {
    btnNuevo.addEventListener('click', () => abrirFormTurno());
  }

  const btnNuevoServ = document.getElementById('btn-nuevo-servicio');
  if (btnNuevoServ) {
    btnNuevoServ.addEventListener('click', () => abrirFormServicio());
  }

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cerrarModales();
    });
  });

  document.querySelectorAll('.btn-cerrar-modal').forEach(btn => {
    btn.addEventListener('click', cerrarModales);
  });
  const btnAyuda = document.getElementById('btn-ayuda');
if (btnAyuda) {
  btnAyuda.addEventListener('click', () => {
    document.getElementById('modal-ayuda')?.classList.remove('oculto');
  });
}
// Copiar link de agenda pública
const btnLinkPublico = document.getElementById('btn-link-publico');
if (btnLinkPublico) {
  btnLinkPublico.addEventListener('click', () => {
    const usuario = Sesion.getUsuario();
    const link = `${window.location.origin}/agenda-publica.html?u=${usuario.id}`;
    navigator.clipboard.writeText(link).then(() => {
      mostrarToast('¡Link copiado! 📋', 'exito');
    });
  });
}
}

function cerrarModales() {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.classList.add('oculto');
  });
  editandoId     = null;
  editandoServId = null;
  limpiarFormTurno();
  limpiarFormServicio();
}

// ═══════════════════════════════════════════════════════════
//  HELPERS FECHA Y HORA
// ═══════════════════════════════════════════════════════════
function hoy() {
  return new Date().toISOString().split('T')[0];
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [anio, mes, dia] = fechaStr.split('-');
  const meses = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'
  ];
  return `${parseInt(dia)} de ${meses[parseInt(mes) - 1]} de ${anio}`;
}

function formatearHora(horaStr) {
  if (!horaStr) return '';
  return horaStr.slice(0, 5);
}

function horaAMinutos(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

function minutosAHora(minutos) {
  const h = Math.floor(minutos / 60).toString().padStart(2, '0');
  const m = (minutos % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function nombreDiaSemana(fechaStr) {
  const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const fecha = new Date(fechaStr + 'T00:00:00');
  return dias[fecha.getDay()];
}

function escaparHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

// ═══════════════════════════════════════════════════════════
//  LÓGICA DE BLOQUEO DE HORARIOS
// ═══════════════════════════════════════════════════════════
function turnosDeFecha(fecha) {
  return turnos.filter(t => {
    const fechaTurno = t.fecha
      ? t.fecha.toString().split('T')[0]
      : null;
    return fechaTurno === fecha;
  });
}

function intervalosBloqueados(fecha, excludeId = null) {
  return turnosDeFecha(fecha)
    .filter(t => t.id !== excludeId)
    .map(t => ({
      inicio: horaAMinutos(t.hora),
      fin:    horaAMinutos(t.hora) + parseInt(t.duracion),
      nombre: t.nombre,
    }));
}

function hayConflicto(fecha, hora, duracion, excludeId = null) {
  const inicio  = horaAMinutos(hora);
  const fin     = inicio + parseInt(duracion);
  const bloques = intervalosBloqueados(fecha, excludeId);
  return bloques.some(b => inicio < b.fin && fin > b.inicio);
}

function estadoHorario(fecha, hora, duracion, excludeId = null) {
  const inicio  = horaAMinutos(hora);
  const fin     = inicio + parseInt(duracion);
  const bloques = intervalosBloqueados(fecha, excludeId);
  for (const b of bloques) {
    if (inicio < b.fin && fin > b.inicio) {
      return { libre: false, conflicto: b.nombre };
    }
  }
  return { libre: true };
}

// ═══════════════════════════════════════════════════════════
//  AGENDA
// ═══════════════════════════════════════════════════════════
function renderAgenda() {
  const contenedor = document.getElementById('lista-usuarios');
  if (!contenedor) return;

  const selectorFecha = document.getElementById('fecha-agenda');
  if (selectorFecha) {
    selectorFecha.value    = fechaSeleccionada;
    selectorFecha.onchange = (e) => {
      fechaSeleccionada = e.target.value;
      renderAgenda();
    };
  }

  const turnosFecha = turnosDeFecha(fechaSeleccionada)
    .sort((a, b) => horaAMinutos(a.hora) - horaAMinutos(b.hora));

  const tituloEl = document.getElementById('titulo-fecha');
  if (tituloEl) {
    const esHoy = fechaSeleccionada === hoy();
    tituloEl.textContent = esHoy
      ? `📅 Hoy — ${formatearFecha(fechaSeleccionada)}`
      : `📅 ${nombreDiaSemana(fechaSeleccionada)}, ${formatearFecha(fechaSeleccionada)}`;
  }

  if (turnosFecha.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <span class="empty-icono">🌸</span>
        <p class="empty-titulo">Sin turnos este día</p>
        <p class="empty-sub">Tocá + para agregar un turno</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = turnosFecha.map(t => cardTurno(t)).join('');
  bindAccionesTurnos(contenedor);
}
function esTurnoPasado(t) {
  try {
    const fechaStr = (t.fecha || '').toString().split('T')[0];
    if (!fechaStr) return false;
    const [a, m, d] = fechaStr.split('-').map(Number);
    const [hh, mm] = (t.hora || '00:00').split(':').map(Number);
    const inicio = new Date(a, m - 1, d, hh, mm);
    const fin = new Date(inicio.getTime() + (parseInt(t.duracion) || 0) * 60000);
    return fin < new Date();
  } catch {
    return false;
  }
}

/**
 * Un turno es "próximo" si empieza en las próximas 2 horas
 */
function esTurnoProximo(t) {
  try {
    const fechaStr = (t.fecha || '').toString().split('T')[0];
    if (!fechaStr) return false;
    const [a, m, d] = fechaStr.split('-').map(Number);
    const [hh, mm] = (t.hora || '00:00').split(':').map(Number);
    const inicio = new Date(a, m - 1, d, hh, mm);
    const ahora = new Date();
    const diffMin = (inicio - ahora) / 60000;
    return diffMin > 0 && diffMin <= 120;
  } catch {
    return false;
  }
}

function cardTurno(t) {
  const c = coloresTurno(t.servicio_color);
  const hora = formatearHora(t.hora);
  const fin = minutosAHora(horaAMinutos(t.hora) + parseInt(t.duracion));

  // Determinar clases de estado
  const clases = ['card-turno'];
  if (t.estado === 'cancelado') clases.push('turno-cancelado');
  if (t.estado === 'pendiente_senia' || (t.senia_requerida && !t.senia_pagada)) {
    clases.push('turno-pendiente-senia');
  }
  if (esTurnoPasado(t)) clases.push('turno-pasado');
  if (esTurnoProximo(t)) clases.push('turno-proximo');

  return `
    <div class="${clases.join(' ')}"
         data-id="${t.id}"
         style="background:${c.fondo};
                border-left:4px solid ${c.borde};
                color:${c.texto};
                box-shadow:${c.sombra};">
      <div class="turno-header">
        <div class="turno-hora-wrap">
          <span class="turno-hora" style="color:${c.borde}">${hora}</span>
          <span class="turno-hora-fin">→ ${fin}</span>
        </div>
        <div class="turno-acciones">
          <button class="btn-icon btn-wa"     data-id="${t.id}" title="WhatsApp">💬</button>
          <button class="btn-icon btn-editar" data-id="${t.id}" title="Editar">✏️</button>
          <button class="btn-icon btn-cancelar-turno ${t.estado === 'cancelado' ? 'turno-cancelado' : ''}"
                  data-id="${t.id}"
                  title="${t.estado === 'cancelado' ? 'Reactivar' : 'Cancelar'}">
            ${t.estado === 'cancelado' ? '✅' : '🚫'}
          </button>
          <button class="btn-icon btn-borrar" data-id="${t.id}" title="Eliminar">🗑</button>
        </div>
      </div>
      <div class="turno-body">
        <p class="turno-nombre">${escaparHTML(t.nombre)}</p>
        <p class="turno-tel">📞 ${escaparHTML(t.telefono)}</p>
        ${t.servicio_nombre ? `
          <p class="turno-servicio" style="color:${c.borde}">
            ✂️ ${escaparHTML(t.servicio_nombre)}
            ${t.servicio_zona ? `· ${escaparHTML(t.servicio_zona)}` : ''}
          </p>` : ''}
        <p class="turno-duracion">⏱ ${t.duracion} min</p>
        ${t.notas ? `<p class="turno-notas">📝 ${escaparHTML(t.notas)}</p>` : ''}
        ${t.senia_requerida ? `
          <div class="turno-senia-wrap">
            ${t.senia_pagada
              ? `<span class="turno-senia-badge pagada">✅ Seña pagada — $${t.monto_senia}</span>`
              : `<span class="turno-senia-badge pendiente">⚠️ Seña pendiente — $${t.monto_senia}</span>
                 <button class="btn-confirmar-senia" data-id="${t.id}" title="Marcar seña como pagada">
                   Confirmar seña ✅
                 </button>`
            }
          </div>` : ''}
      </div>
    </div>`;
}


function bindAccionesTurnos(contenedor) {
  contenedor.querySelectorAll('.btn-wa').forEach(btn => {
    btn.addEventListener('click', () => {
      const turno = turnos.find(t => t.id === btn.dataset.id);
      if (turno) abrirWhatsApp(turno);
    });
  });

  contenedor.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', () => {
      const turno = turnos.find(t => t.id === btn.dataset.id);
      if (turno) abrirFormTurno(turno);
    });
  });
contenedor.querySelectorAll('.btn-cancelar-turno').forEach(btn => {
  btn.addEventListener('click', () => toggleCancelarTurno(btn.dataset.id));
});
  contenedor.querySelectorAll('.btn-borrar').forEach(btn => {
    btn.addEventListener('click', () => confirmarEliminarTurno(btn.dataset.id));
  });

  contenedor.querySelectorAll('.btn-confirmar-senia').forEach(btn => {
    btn.addEventListener('click', () => confirmarPagoSenia(btn.dataset.id));
  });
}

// ═══════════════════════════════════════════════════════════
//  FORMULARIO TURNO
// ═══════════════════════════════════════════════════════════
function bindFormTurno() {
  const form = document.getElementById('form-turno');
  if (!form) return;
  form.addEventListener('submit', handleSubmitTurno);
  
  const selectServ = document.getElementById('turno-servicio-id');
  if (selectServ) {
    selectServ.addEventListener('change', () => {
      const serv = servicios.find(s => s.id === selectServ.value);
      if (serv) {
        setVal('turno-duracion',        serv.duracion);
        setVal('turno-servicio-nombre', serv.nombre);
        setVal('turno-servicio-zona',   serv.zona);
        setVal('turno-servicio-color',  serv.color);
      }
    });
  }
  
}

function abrirFormTurno(turno = null) {
  editandoId = turno?.id || null;
  limpiarFormTurno();

  const modal      = document.getElementById('modal-turno');
  const titulo     = document.getElementById('modal-turno-titulo');
  const btnGuardar = document.getElementById('btn-guardar-turno');

  if (titulo)    titulo.textContent     = turno ? '✏️ Editar turno'   : '➕ Nuevo turno';
  if (btnGuardar) btnGuardar.textContent = turno ? 'Guardar cambios'   : 'Guardar turno';

  // Poblar selector de servicios
  const selectServ = document.getElementById('turno-servicio-id');
  if (selectServ) {
    selectServ.innerHTML =
      `<option value="">— Sin servicio —</option>` +
      servicios.map(s =>
        `<option value="${s.id}" ${turno?.servicio_id === s.id ? 'selected' : ''}>
          ${escaparHTML(s.nombre)} · ${escaparHTML(s.zona)}
        </option>`
      ).join('');
  }

  if (turno) {
    setVal('turno-nombre',          turno.nombre);
    setVal('turno-telefono',        turno.telefono);
    setVal('turno-fecha',           turno.fecha);
    setVal('turno-hora',            formatearHora(turno.hora));
    setVal('turno-duracion',        turno.duracion);
    setVal('turno-servicio-nombre', turno.servicio_nombre || '');
    setVal('turno-servicio-zona',   turno.servicio_zona   || '');
    setVal('turno-servicio-color',  turno.servicio_color  || '#A85568');
    setVal('turno-notas',           turno.notas           || '');
    setVal('turno-cumple-dia',      turno.cumple_dia      || '');
    setVal('turno-cumple-mes',      turno.cumple_mes      || '');
  } else {
    setVal('turno-fecha',          fechaSeleccionada);
    setVal('turno-servicio-color', '#A85568');
  }
  const selectHora = document.getElementById('turno-hora');
if (selectHora) {
  selectHora.innerHTML = '<option value="">— Elegí un horario —</option>';
  for (let m = 7 * 60; m <= 20 * 60; m += 15) {
    const val = minutosAHora(m);
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    if (turno?.hora && formatearHora(turno.hora) === val) opt.selected = true;
    selectHora.appendChild(opt);
  }
}

  modal?.classList.remove('oculto');
}

function limpiarFormTurno() {
  const form = document.getElementById('form-turno');
  if (form) form.reset();
  const errEl = document.getElementById('form-turno-error');
  if (errEl) errEl.classList.add('oculto');
}

async function handleSubmitTurno(e) {
  e.preventDefault();

  const nombre         = getVal('turno-nombre').trim();
  const telefono       = getVal('turno-telefono').trim();
  const fecha          = getVal('turno-fecha');
  const hora           = getVal('turno-hora');
  const duracion       = parseInt(getVal('turno-duracion'));
  const servicioId     = getVal('turno-servicio-id')     || null;
  const servicioNombre = getVal('turno-servicio-nombre') || null;
  const servicioZona   = getVal('turno-servicio-zona')   || null;
  const servicioColor  = getVal('turno-servicio-color')  || '#A85568';
  const notas          = getVal('turno-notas')           || null;
  const cumpleDia      = parseInt(getVal('turno-cumple-dia')) || null;
  const cumpleMes      = parseInt(getVal('turno-cumple-mes')) || null;

  // Validaciones frontend
  if (!nombre || !telefono || !fecha || !hora || !duracion) {
    mostrarErrorForm('form-turno-error', 'Completá todos los campos obligatorios');
    return;
  }

  if (duracion < 5 || duracion > 480) {
    mostrarErrorForm('form-turno-error', 'La duración debe ser entre 5 y 480 minutos');
    return;
  }
  const horaMinutos = horaAMinutos(hora);
if (horaMinutos < horaAMinutos('07:00') || horaMinutos > horaAMinutos('20:00')) {
  mostrarErrorForm('form-turno-error', 'El horario debe ser entre las 7:00 y las 20:00');
  return;
}

  // Verificar conflicto localmente (feedback inmediato)
  const estado = estadoHorario(fecha, hora, duracion, editandoId);
  if (!estado.libre) {
    mostrarErrorForm('form-turno-error',
      `Conflicto de horario con el turno de ${estado.conflicto}`);
    return;
  }
  

  const payload = {
    nombre,
    telefono,
    fecha,
    hora,
    duracion,
    servicio_id:     servicioId,
    servicio_nombre: servicioNombre,
    servicio_zona:   servicioZona,
    servicio_color:  servicioColor,
    notas,
    cumple_dia:      cumpleDia,
    cumple_mes:      cumpleMes,
  };

  setBtnLoading('btn-guardar-turno', true);

  try {
    let data;
    if (editandoId) {
      data = await TurnosAPI.actualizar(editandoId, payload);
    } else {
      data = await TurnosAPI.crear(payload);
    }

    if (!data?.ok) {
      mostrarErrorForm('form-turno-error', data?.error || 'Error al guardar');
      return;
    }

    // Actualizar estado local
    if (editandoId) {
      turnos = turnos.map(t => t.id === editandoId ? data.turno : t);
      mostrarToast('Turno actualizado ✅', 'exito');
    } else {
      turnos.push(data.turno);
      mostrarToast('Turno creado ✅', 'exito');
    }

    cerrarModales();
    renderTabActual();

  } catch (err) {
    mostrarErrorForm('form-turno-error', err.message || 'Error al guardar el turno');
  } finally {
    setBtnLoading('btn-guardar-turno', false);
  }
}

async function confirmarEliminarTurno(id) {
  const turno = turnos.find(t => t.id === id);
  if (!turno) return;

  if (!confirm(`¿Eliminar el turno de ${turno.nombre}?`)) return;

  try {
    const data = await TurnosAPI.eliminar(id);
    if (!data?.ok) {
      mostrarToast(data?.error || 'Error al eliminar', 'error');
      return;
    }

    turnos = turnos.filter(t => t.id !== id);
    mostrarToast('Turno eliminado', 'exito');
    renderTabActual();

  } catch (err) {
    mostrarToast(err.message || 'Error al eliminar', 'error');
  }
}
async function toggleCancelarTurno(id) {
  const turno = turnos.find(t => t.id === id);
  if (!turno) return;

  const nuevoEstado = turno.estado === 'cancelado' ? 'activo' : 'cancelado';
  const accion      = nuevoEstado === 'cancelado' ? 'cancelar' : 'reactivar';

  if (!confirm(`¿Querés ${accion} el turno de ${turno.nombre}?`)) return;

  try {
const fechaLimpia = turno.fecha
  ? turno.fecha.toString().split('T')[0]
  : turno.fecha;

const horaLimpia = turno.hora
  ? turno.hora.toString().slice(0, 5)
  : turno.hora;

const data = await TurnosAPI.actualizar(id, {
  nombre:          turno.nombre,
  telefono:        turno.telefono,
  fecha:           fechaLimpia,
  hora:            horaLimpia,
  duracion:        turno.duracion,
  servicio_id:     turno.servicio_id     || null,
  servicio_nombre: turno.servicio_nombre || null,
  servicio_zona:   turno.servicio_zona   || null,
  servicio_color:  turno.servicio_color  || '#A85568',
  notas:           turno.notas           || null,
  cumple_dia:      turno.cumple_dia      || null,
  cumple_mes:      turno.cumple_mes      || null,
  estado:          nuevoEstado,
});
    if (!data?.ok) {
      mostrarToast(data?.error || 'Error al actualizar', 'error');
      return;
    }

    turnos = turnos.map(t => t.id === id ? data.turno : t);
    mostrarToast(
      nuevoEstado === 'cancelado' ? 'Turno cancelado 🚫' : 'Turno reactivado ✅',
      'exito'
    );
    renderTabActual();

  } catch (err) {
    mostrarToast(err.message || 'Error al actualizar', 'error');
  }
}

async function confirmarPagoSenia(id) {
  const turno = turnos.find(t => String(t.id) === String(id));
  if (!turno) return;

  if (!confirm(`¿Confirmar que ${turno.nombre} pagó la seña de $${turno.monto_senia}?`)) return;

  try {
    const data = await TurnosAPI.confirmarSenia(id);
    if (!data?.ok) { mostrarToast(data?.error || 'Error al confirmar', 'error'); return; }
    turnos = turnos.map(t => String(t.id) === String(id) ? data.turno : t);
    mostrarToast('✅ Seña confirmada', 'exito');
    renderTabActual();
  } catch(err) {
    mostrarToast(err.message || 'Error al confirmar seña', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  CALENDARIO
// ═══════════════════════════════════════════════════════════
function renderCalendario() {
  const contenedor = document.getElementById('cal-grilla');
  if (!contenedor) return;

  const anio = mesCalendario.getFullYear();
  const mes  = mesCalendario.getMonth();

  // Título del mes
  const meses = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  const tituloEl = document.getElementById('cal-titulo');
  if (tituloEl) tituloEl.textContent = `${meses[mes]} ${anio}`;

  // Navegación mes
  const btnPrev = document.getElementById('cal-prev');
  const btnNext = document.getElementById('cal-next');
  if (btnPrev) btnPrev.onclick = () => { mesCalendario.setMonth(mes - 1); renderCalendario(); };
  if (btnNext) btnNext.onclick = () => { mesCalendario.setMonth(mes + 1); renderCalendario(); };

  // Primer día del mes y total de días
  const primerDia  = new Date(anio, mes, 1).getDay();
  const totalDias  = new Date(anio, mes + 1, 0).getDate();
  const hoyStr     = hoy();

  let html = '';

  // Días de la semana
  ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].forEach(d => {
    html += `<div class="cal-dia-nombre">${d}</div>`;
  });

  // Espacios vacíos antes del primer día
  for (let i = 0; i < primerDia; i++) {
    html += `<div class="cal-celda vacia"></div>`;
  }

  // Días del mes
  for (let dia = 1; dia <= totalDias; dia++) {
    const fechaStr  = `${anio}-${String(mes + 1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const cantidad  = turnosDeFecha(fechaStr).length;
    const esHoy     = fechaStr === hoyStr;
    const esSelec   = fechaStr === fechaSeleccionada;

    html += `
      <div class="cal-celda ${esHoy ? 'hoy' : ''} ${esSelec ? 'seleccionada' : ''} ${cantidad > 0 ? 'con-turnos' : ''}"
           data-fecha="${fechaStr}">
        <span class="cal-numero">${dia}</span>
        ${cantidad > 0 ? `<span class="cal-badge">${cantidad}</span>` : ''}
      </div>`;
  }

  contenedor.innerHTML = html;

  // Click en día
  contenedor.querySelectorAll('.cal-celda:not(.vacia)').forEach(celda => {
    celda.addEventListener('click', () => {
      const fecha = celda.dataset.fecha;
      fechaSeleccionada = fecha;

      // Ir a agenda con esa fecha
      tabActual = 'agenda';
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('activo', b.dataset.tab === 'agenda');
      });
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('activo', p.dataset.panel === 'agenda');
      });
      renderAgenda();
    });
  });

  // Timeline del mes seleccionado
  renderTimelineMes(anio, mes);
}

function renderTimelineMes(anio, mes) {
  const contenedor = document.getElementById('cal-timeline');
  if (!contenedor) return;

  const turnosMes = turnos.filter(t => {
    const [a, m] = t.fecha.split('-').map(Number);
    return a === anio && m === mes + 1 && t.estado !== 'cancelado';
  }).sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return horaAMinutos(a.hora) - horaAMinutos(b.hora);
  });

  if (turnosMes.length === 0) {
    contenedor.innerHTML = `
      <p class="timeline-vacio">Sin turnos este mes</p>`;
    return;
  }

  // Agrupar por fecha
  const porFecha = {};
  turnosMes.forEach(t => {
    if (!porFecha[t.fecha]) porFecha[t.fecha] = [];
    porFecha[t.fecha].push(t);
  });

  contenedor.innerHTML = Object.entries(porFecha).map(([fecha, ts]) => `
    <div class="timeline-grupo">
      <div class="timeline-fecha">
        ${nombreDiaSemana(fecha)} ${formatearFecha(fecha)}
      </div>
      ${ts.map(t => `
        <div class="timeline-item" style="border-left:3px solid ${t.servicio_color || '#A85568'}">
          <span class="timeline-hora">${formatearHora(t.hora)}</span>
          <span class="timeline-nombre">${escaparHTML(t.nombre)}</span>
          ${t.servicio_nombre
            ? `<span class="timeline-serv">${escaparHTML(t.servicio_nombre)}</span>`
            : ''}
        </div>`).join('')}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
//  SERVICIOS
// ═══════════════════════════════════════════════════════════
function renderServicios() {
  const contenedor = document.getElementById('lista-servicios');
  const buscador   = document.getElementById('buscar-servicio');
  if (!contenedor) return;

  const textoBusqueda = (buscador?.value || '').toLowerCase().trim();

  // Filtrar por nombre, zona o categoría
  const serviciosFiltrados = servicios.filter(s => {
    if (!textoBusqueda) return true;
    return (
      (s.nombre    || '').toLowerCase().includes(textoBusqueda) ||
      (s.zona      || '').toLowerCase().includes(textoBusqueda) ||
      (s.categoria || '').toLowerCase().includes(textoBusqueda)
    );
  });

  // Empty state
  if (serviciosFiltrados.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <span class="empty-icono">${textoBusqueda ? '🔍' : '✂️'}</span>
        <p class="empty-titulo">${textoBusqueda ? 'Sin resultados' : 'Sin servicios'}</p>
        <p class="empty-sub">${textoBusqueda ? 'Probá con otra búsqueda' : 'Creá tu primer servicio'}</p>
      </div>`;
    return;
  }

  // Agrupar por categoría
  const agrupados = {};
  serviciosFiltrados.forEach(serv => {
    const cat = serv.categoria || 'General';
    if (!agrupados[cat]) agrupados[cat] = [];
    agrupados[cat].push(serv);
  });

  // Ordenar categorías alfabéticamente
  const categoriasOrdenadas = Object.keys(agrupados).sort();

  // Si hay búsqueda, abrir todo por default
  const abrirTodo = !!textoBusqueda;

  contenedor.innerHTML = categoriasOrdenadas.map(categoria => {
    const items = agrupados[categoria];
    return `
      <div class="categoria-servicios ${abrirTodo ? 'abierta' : ''}">
        <button class="categoria-header" type="button">
          <span class="categoria-chevron">▸</span>
          <span class="categoria-nombre">${escaparHTML(categoria)}</span>
          <span class="categoria-count">${items.length}</span>
        </button>
        <div class="categoria-body ${abrirTodo ? '' : 'oculto'}">
          ${items.map(s => cardServicioHTML(s)).join('')}
        </div>
      </div>
    `;
  }).join('');

  bindAccordionServicios();
  bindAccionesServicios(contenedor);
  actualizarCategoriasDatalist();
}

function cardServicioHTML(s) {
  return `
    <div class="card-servicio" data-id="${s.id}" style="border-left:4px solid ${s.color || '#A85568'}">
      <div class="serv-color" style="background:${s.color || '#A85568'}"></div>
      <div class="serv-info">
        <p class="serv-nombre">${escaparHTML(s.nombre)}</p>
        <p class="serv-zona">📍 ${escaparHTML(s.zona || '')}</p>
        <p class="serv-duracion">⏱ ${s.duracion} min${s.requiere_senia ? ` · 💰 Seña $${s.monto_senia}` : ''}</p>
        ${s.descripcion ? `<p class="serv-desc">${escaparHTML(s.descripcion)}</p>` : ''}
      </div>
      <div class="serv-acciones">
        <button class="btn-icon btn-editar-serv" data-id="${s.id}" title="Editar">✏️</button>
        <button class="btn-icon btn-borrar-serv" data-id="${s.id}" title="Eliminar">🗑</button>
      </div>
    </div>
  `;
}

function actualizarCategoriasDatalist() {
  const datalist = document.getElementById('categorias-sugeridas');
  if (!datalist) return;

  const categoriasUnicas = [...new Set(
    servicios.map(s => s.categoria || 'General').filter(Boolean)
  )].sort();

  datalist.innerHTML = categoriasUnicas
    .map(c => `<option value="${escaparHTML(c)}">`)
    .join('');
}

function bindAccionesServicios(contenedor) {
  contenedor.querySelectorAll('.btn-editar-serv').forEach(btn => {
    btn.addEventListener('click', () => {
      const serv = servicios.find(s => String(s.id) === String(btn.dataset.id));
      if (serv) abrirFormServicio(serv);
    });
  });

  contenedor.querySelectorAll('.btn-borrar-serv').forEach(btn => {
    btn.addEventListener('click', () => confirmarEliminarServicio(btn.dataset.id));
  });
}

function bindAccordionServicios() {
  document.querySelectorAll('.categoria-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrapper = btn.parentElement;
      const body    = btn.nextElementSibling;
      wrapper.classList.toggle('abierta');
      body.classList.toggle('oculto');
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  FORMULARIO SERVICIO
// ═══════════════════════════════════════════════════════════
function bindFormServicio() {
  const form = document.getElementById('form-servicio');
  if (!form) return;
  form.addEventListener('submit', handleSubmitServicio);

  const toggleSenia = document.getElementById('serv-requiere-senia');
  const montoWrap   = document.getElementById('serv-senia-monto-wrap');
  if (toggleSenia && montoWrap) {
    toggleSenia.addEventListener('change', () => {
      montoWrap.classList.toggle('oculto', !toggleSenia.checked);
      if (!toggleSenia.checked) setVal('serv-monto-senia', '');
    });
  }
}

function abrirFormServicio(serv = null) {
  editandoServId = serv?.id || null;
  limpiarFormServicio();

  const modal      = document.getElementById('modal-servicio');
  const titulo     = document.getElementById('modal-servicio-titulo');
  const btnGuardar = document.getElementById('btn-guardar-servicio');

  if (titulo)     titulo.textContent      = serv ? '✏️ Editar servicio' : '➕ Nuevo servicio';
  if (btnGuardar) btnGuardar.textContent  = serv ? 'Guardar cambios'    : 'Guardar servicio';

  const toggleSenia = document.getElementById('serv-requiere-senia');
  const montoWrap   = document.getElementById('serv-senia-monto-wrap');

 if (serv) {
  setVal('serv-nombre',      serv.nombre);
  setVal('serv-categoria',   serv.categoria || '');
  setVal('serv-zona',        serv.zona);
  setVal('serv-duracion',    serv.duracion);
  setVal('serv-color',       serv.color || '#A85568');
  setVal('serv-descripcion', serv.descripcion || '');

  if (toggleSenia) toggleSenia.checked = !!serv.requiere_senia;
  if (montoWrap)   montoWrap.classList.toggle('oculto', !serv.requiere_senia);

  setVal('serv-monto-senia', serv.monto_senia || '');
  } else {
    setVal('serv-color', '#A85568');
   setVal('serv-categoria', '');
    if (toggleSenia) toggleSenia.checked = false;
    if (montoWrap)   montoWrap.classList.add('oculto');
    setVal('serv-monto-senia', '');
  }

  modal?.classList.remove('oculto');
}

function limpiarFormServicio() {
  const form = document.getElementById('form-servicio');
  if (form) form.reset();
  const errEl = document.getElementById('form-servicio-error');
  if (errEl) errEl.classList.add('oculto');
}

async function handleSubmitServicio(e) {
  e.preventDefault();

  const nombre      = getVal('serv-nombre').trim();
  const zona        = getVal('serv-zona').trim();
  const duracion    = parseInt(getVal('serv-duracion'));
  const color       = getVal('serv-color')       || '#A85568';
  const descripcion = getVal('serv-descripcion') || null;
  const categoria = getVal('serv-categoria').trim() || 'Sin categoría';
  // Validaciones
  if (!nombre || !zona || !duracion) {
    mostrarErrorForm('form-servicio-error', 'Completá todos los campos obligatorios');
    return;
  }

  if (duracion < 5 || duracion > 480) {
    mostrarErrorForm('form-servicio-error', 'La duración debe ser entre 5 y 480 minutos');
    return;
  }

  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    mostrarErrorForm('form-servicio-error', 'Color inválido');
    return;
  }

  const requiereSenia = document.getElementById('serv-requiere-senia')?.checked || false;
  const montoSenia    = requiereSenia ? (parseFloat(getVal('serv-monto-senia')) || 0) : 0;

  if (requiereSenia && montoSenia <= 0) {
    mostrarErrorForm('form-servicio-error', 'Ingresá un monto válido para la seña');
    return;
  }

const payload = {
  nombre,
  categoria,
  zona,
  duracion,
  color,
  descripcion,
  requiere_senia: requiereSenia,
  monto_senia:    montoSenia,
};

  setBtnLoading('btn-guardar-servicio', true);

  try {
    let data;
    if (editandoServId) {
      data = await ServiciosAPI.actualizar(editandoServId, payload);
    } else {
      data = await ServiciosAPI.crear(payload);
    }

    if (!data?.ok) {
      mostrarErrorForm('form-servicio-error', data?.error || 'Error al guardar');
      return;
    }

    if (editandoServId) {
      servicios = servicios.map(s => String(s.id) === String(editandoServId) ? data.servicio : s);
      mostrarToast('Servicio actualizado ✅', 'exito');
    } else {
      servicios.push(data.servicio);
      mostrarToast('Servicio creado ✅', 'exito');
    }

    cerrarModales();
    renderServicios();

  } catch (err) {
    mostrarErrorForm('form-servicio-error', err.message || 'Error al guardar el servicio');
  } finally {
    setBtnLoading('btn-guardar-servicio', false);
  }
}

async function confirmarEliminarServicio(id) {
  const serv = servicios.find(s => String(s.id) === String(id));
  if (!serv) return;

  if (!confirm(`¿Eliminar el servicio "${serv.nombre}"?`)) return;

  try {
    const data = await ServiciosAPI.eliminar(id);
    if (!data?.ok) {
      mostrarToast(data?.error || 'Error al eliminar', 'error');
      return;
    }

    servicios = servicios.filter(s => String(s.id) !== String(id));
    mostrarToast('Servicio eliminado', 'exito');
    renderServicios();

  } catch (err) {
    mostrarToast(err.message || 'Error al eliminar', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  CUMPLEAÑOS
// ═══════════════════════════════════════════════════════════
async function renderCumples() {
  const contenedor = document.getElementById('lista-cumple-hoy');
  if (!contenedor) return;

  // Cargar cumpleaños frescos desde la API
  const cumples = await apiCall(
    () => TurnosAPI.getCumples(),
    'Error al cargar cumpleaños'
  ) || [];

  const hoyDate  = new Date();
  const diaHoy   = hoyDate.getDate();
  const mesHoy   = hoyDate.getMonth() + 1;

  // Separar: hoy vs resto del mes
  const cumpleHoy  = cumples.filter(c => c.cumple_dia === diaHoy && c.cumple_mes === mesHoy);
  const cumpleMes  = cumples.filter(c => !(c.cumple_dia === diaHoy && c.cumple_mes === mesHoy));

  // Contador badge
  const badgeEl = document.getElementById('badge-cumples');
  if (badgeEl) {
    badgeEl.textContent = cumpleHoy.length > 0 ? cumpleHoy.length : '';
    badgeEl.style.display = cumpleHoy.length > 0 ? 'flex' : 'none';
  }

  let html = '';

  // ── Cumpleaños HOY ──────────────────────────────────────
  if (cumpleHoy.length > 0) {
    html += `<div class="cumple-seccion-titulo">🎂 Hoy cumplen años</div>`;
    html += cumpleHoy.map(c => cardCumple(c, true)).join('');
  }

  // ── Resto del mes ───────────────────────────────────────
  if (cumpleMes.length > 0) {
    html += `<div class="cumple-seccion-titulo">📅 Este mes</div>`;
    html += cumpleMes
      .sort((a, b) => a.cumple_dia - b.cumple_dia)
      .map(c => cardCumple(c, false))
      .join('');
  }

  if (cumples.length === 0) {
    html = `
      <div class="empty-state">
        <span class="empty-icono">🎂</span>
        <p class="empty-titulo">Sin cumpleaños este mes</p>
        <p class="empty-sub">Agregá fechas de cumpleaños al crear turnos</p>
      </div>`;
  }

  contenedor.innerHTML = html;

  // Bind botones WhatsApp cumpleaños
  contenedor.querySelectorAll('.btn-wa-cumple').forEach(btn => {
    btn.addEventListener('click', () => {
      const cumple = cumples.find(c => c.id === btn.dataset.id);
      if (cumple) abrirWhatsAppCumple(cumple);
    });
  });
}

function cardCumple(c, esHoy) {
  const meses = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'
  ];
  const fechaCumple = `${c.cumple_dia} de ${meses[c.cumple_mes - 1]}`;

  return `
    <div class="card-cumple ${esHoy ? 'cumple-hoy' : ''}">
      <div class="cumple-info">
        <span class="cumple-icono">${esHoy ? '🎉' : '🎂'}</span>
        <div>
          <p class="cumple-nombre">${escaparHTML(c.nombre)}</p>
          <p class="cumple-fecha">${fechaCumple}</p>
          <p class="cumple-tel">📞 ${escaparHTML(c.telefono)}</p>
        </div>
      </div>
      <button class="btn-icon btn-wa-cumple" data-id="${c.id}" title="Enviar saludo">
        💬
      </button>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  WHATSAPP
// ═══════════════════════════════════════════════════════════
function abrirWhatsApp(turno) {
  const plantilla = config.plantilla_turno || '';

  const fecha = formatearFecha(turno.fecha);
  const hora  = formatearHora(turno.hora);

  const mensaje = plantilla
    .replace(/{nombre}/g,   turno.nombre          || '')
    .replace(/{fecha}/g,    fecha                  || '')
    .replace(/{hora}/g,     hora                   || '')
    .replace(/{servicio}/g, turno.servicio_nombre  || '')
    .replace(/{zona}/g,     turno.servicio_zona    || '')
    .replace(/{duracion}/g, turno.duracion         || '');

  // Mostrar preview antes de abrir
  mostrarPreviewWA(turno.telefono, mensaje);
}

function abrirWhatsAppCumple(cumple) {
  const plantilla = config.plantilla_cumple || '';

  const mensaje = plantilla
    .replace(/{nombre}/g, cumple.nombre || '');

  mostrarPreviewWA(cumple.telefono, mensaje);
}

function mostrarPreviewWA(telefono, mensaje) {
  const modal      = document.getElementById('modal-wa');
  const previewEl  = document.getElementById('wa-preview-texto');
  const btnEnviar  = document.getElementById('btn-wa-enviar');

  if (!modal) {
    // Si no hay modal, abrir directo
    abrirLinkWA(telefono, mensaje);
    return;
  }

  if (previewEl) previewEl.textContent = mensaje;

  if (btnEnviar) {
    // Remover listeners anteriores
    const nuevo = btnEnviar.cloneNode(true);
    btnEnviar.parentNode.replaceChild(nuevo, btnEnviar);
    nuevo.addEventListener('click', () => {
      abrirLinkWA(telefono, mensaje);
      cerrarModales();
    });
  }

  modal.classList.remove('oculto');
}

function abrirLinkWA(telefono, mensaje) {
  // Limpiar teléfono — solo números
  const tel      = telefono.replace(/\D/g, '');
  const encoded  = encodeURIComponent(mensaje);
  const url      = `https://wa.me/${tel}?text=${encoded}`;
  window.open(url, '_blank');
}

// ═══════════════════════════════════════════════════════════
//  CONFIGURACIÓN (plantillas WhatsApp)
// ═══════════════════════════════════════════════════════════
function bindConfiguracion() {
  const formConfig = document.getElementById('form-config');
  if (!formConfig) return;

  // Cargar valores actuales
  const ptTurno  = document.getElementById('config-plantilla-turno');
  const ptCumple = document.getElementById('config-plantilla-cumple');

  if (ptTurno)  ptTurno.value  = config.plantilla_turno  || '';
  if (ptCumple) ptCumple.value = config.plantilla_cumple || '';

  formConfig.addEventListener('submit', async (e) => {
    e.preventDefault();

    const plantillaTurno  = getVal('config-plantilla-turno').trim();
    const plantillaCumple = getVal('config-plantilla-cumple').trim();

    if (!plantillaTurno || !plantillaCumple) {
      mostrarToast('Completá ambas plantillas', 'error');
      return;
    }

    setBtnLoading('btn-guardar-config', true);

    try {
      const data = await ConfigAPI.guardar({
        plantilla_turno:  plantillaTurno,
        plantilla_cumple: plantillaCumple,
      });

      if (!data?.ok) {
        mostrarToast(data?.error || 'Error al guardar', 'error');
        return;
      }

      config.plantilla_turno  = plantillaTurno;
      config.plantilla_cumple = plantillaCumple;
      mostrarToast('Configuración guardada ✅', 'exito');

    } catch (err) {
      mostrarToast(err.message || 'Error al guardar configuración', 'error');
    } finally {
      setBtnLoading('btn-guardar-config', false);
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Toast de notificación
 * tipo: 'exito' | 'error' | 'info'
 */
function mostrarToast(mensaje, tipo = 'info') {
  // Remover toast anterior si existe
  const anterior = document.getElementById('toast-global');
  if (anterior) anterior.remove();

  const iconos = {
    exito: '✅',
    error: '❌',
    info:  'ℹ️',
  };

    const colores = {
    exito: '#2D7A4F',
    error: '#C0392B',
    info:  '#2C3E50',
  };

  const toast = document.createElement('div');
  toast.id = 'toast-global';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colores[tipo] || colores.info};
    color: white;
    padding: 12px 20px;
    border-radius: 100px;
    font-family: 'Nunito', sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,.25);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 90vw;
    text-align: center;
    animation: aparecer .3s ease;
  `;
  toast.innerHTML = `<span>${iconos[tipo] || ''}</span><span>${escaparHTML(mensaje)}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Muestra/oculta overlay de carga global
 */
function mostrarCargando(estado) {
  cargando = estado;
  let overlay = document.getElementById('overlay-cargando');

  if (estado) {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'overlay-cargando';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(255,255,255,.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 8888;
      backdrop-filter: blur(2px);
    `;
    overlay.innerHTML = `
      <div style="text-align:center">
        <div style="
          width: 48px; height: 48px;
          border: 4px solid rgba(168,85,104,.2);
          border-top-color: #A85568;
          border-radius: 50%;
          animation: girar .7s linear infinite;
          margin: 0 auto 12px;
        "></div>
        <p style="
          font-family: 'Nunito', sans-serif;
          font-size: 14px;
          color: #A85568;
          font-weight: 600;
        ">Cargando...</p>
      </div>`;
    document.body.appendChild(overlay);
  } else {
    if (overlay) overlay.remove();
  }
}

/**
 * Muestra error dentro de un formulario
 */
function mostrarErrorForm(id, mensaje) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = mensaje;
  el.classList.remove('oculto');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Activa/desactiva estado loading en un botón
 */
function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;

  if (loading) {
    btn.disabled = true;
    btn.dataset.textoOriginal = btn.textContent;
    btn.innerHTML = `
      <span style="
        display:inline-block;
        width:16px; height:16px;
        border:2.5px solid rgba(255,255,255,.4);
        border-top-color:white;
        border-radius:50%;
        animation:girar .7s linear infinite;
        vertical-align:middle;
        margin-right:6px;
      "></span>
      Guardando...`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.textoOriginal || 'Guardar';
  }
}
// ═══════════════════════════════════════════════════════════
//  WHATSAPP PENDIENTES
// ═══════════════════════════════════════════════════════════
let waInterval = null;

const TIPOS_WA_LABEL = {
  reserva_confirmada:        '🌸 Reserva confirmada',
  senia_pendiente:           '💰 Seña pendiente',
  senia_confirmada:          '✅ Seña confirmada',
  recordatorio_24h_clienta:  '⏰ Recordatorio 24h',
  recordatorio_2h_clienta:   '🔔 Recordatorio 2h',
  turno_modificado_clienta:  '✏️ Turno modificado',
  turno_cancelado_clienta:   '🚫 Turno cancelado',
  cumple_clienta:            '🎂 Cumpleaños',
  nueva_reserva_estetica:    '🌸 Nueva reserva',
  recordatorio_24h_estetica: '⏰ Recordatorio para vos',
  trial_por_vencer_admin:    '⏰ Trial por vencer',
  trial_vencido_admin:       '🚫 Trial vencido',
};

function inicializarWaPendientes() {
  const btn = document.getElementById('btn-wa-pendientes');
  const panel = document.getElementById('wa-panel');
  const btnCerrar = document.getElementById('btn-cerrar-wa');

  if (!btn || !panel) return;

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const abierto = !panel.classList.contains('oculto');
    if (abierto) {
      panel.classList.add('oculto');
    } else {
      panel.classList.remove('oculto');
      await cargarWaPendientes();
    }
  });

  btnCerrar?.addEventListener('click', () => panel.classList.add('oculto'));

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.classList.add('oculto');
    }
  });

  actualizarBadgeWa();
  waInterval = setInterval(actualizarBadgeWa, 60000);
}

async function actualizarBadgeWa() {
  try {
    const { pendientes } = await WaAPI.listar({ soloPendientes: true });
    const badge = document.getElementById('wa-badge');
    if (!badge) return;
    if (pendientes > 0) {
      badge.textContent = pendientes > 99 ? '99+' : pendientes;
      badge.classList.remove('oculto');
    } else {
            badge.classList.add('oculto');
    }
  } catch (err) {
    console.error('[wa] badge:', err.message);
  }
}

async function cargarWaPendientes() {
  const lista = document.getElementById('wa-lista');
  if (!lista) return;

  lista.innerHTML = '<p class="wa-vacio">Cargando...</p>';

  try {
    const { mensajes } = await WaAPI.listar({ soloPendientes: true });

    if (mensajes.length === 0) {
      lista.innerHTML = '<p class="wa-vacio">¡Todo al día! 🌸<br>No tenés mensajes pendientes.</p>';
      return;
    }

    lista.innerHTML = mensajes.map(m => `
      <div class="wa-item" data-id="${m.id}">
        <div class="wa-item-header">
          <p class="wa-item-tipo">${TIPOS_WA_LABEL[m.tipo] || m.tipo}</p>
          <span class="wa-item-tiempo">${tiempoRelativoCorto(m.creado_en)}</span>
        </div>
        <p class="wa-item-destinatario">${escaparHTML(m.destinatario_nombre || '—')}</p>
        <p class="wa-item-tel">📞 ${escaparHTML(m.destinatario_telefono || '—')}</p>
        <div class="wa-item-mensaje">${escaparHTML(m.mensaje)}</div>
        <div class="wa-item-acciones">
          <button class="wa-btn-enviar" data-id="${m.id}" data-tel="${escaparHTML(m.destinatario_telefono || '')}" data-msg="${encodeURIComponent(m.mensaje)}">
            💬 Enviar por WhatsApp
          </button>
          <button class="wa-btn-marcar" data-id="${m.id}" title="Marcar como enviado manualmente">
            ✓ Ya envié
          </button>
          <button class="wa-btn-eliminar" data-id="${m.id}" title="Descartar">
            🗑
          </button>
        </div>
      </div>
    `).join('');

    // Enviar por WhatsApp (abre wa.me + marca como enviado)
    lista.querySelectorAll('.wa-btn-enviar').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        const tel = (b.dataset.tel || '').replace(/\D/g, '');
        const msg = b.dataset.msg;
        if (!tel) {
          alert('Esta clienta no tiene teléfono registrado');
          return;
        }
        window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
        await WaAPI.marcarEnviado(id);
        await actualizarBadgeWa();
        await cargarWaPendientes();
      });
    });

    // Marcar como enviado sin abrir WhatsApp
    lista.querySelectorAll('.wa-btn-marcar').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        await WaAPI.marcarEnviado(id);
        await actualizarBadgeWa();
        await cargarWaPendientes();
      });
    });
   // ═══════════════════════════════════════════════════════════
//  WHATSAPP — CONECTAR
// ═══════════════════════════════════════════════════════════

let waPollingInterval = null;

function bindBtnConectarWhatsApp() {
  const btn = document.getElementById('btn-wa-conectar');
  if (btn) {
    btn.addEventListener('click', abrirModalConectarWA);
  }

  document.getElementById('btn-wa-metodo-qr')
    ?.addEventListener('click', iniciarConexionQR);

  document.getElementById('btn-wa-metodo-codigo')
    ?.addEventListener('click', () => {
      mostrarStepWA('numero');
    });

  document.getElementById('btn-wa-pedir-codigo')
    ?.addEventListener('click', iniciarConexionCodigo);
}

async function abrirModalConectarWA() {
  const modal = document.getElementById('modal-wa-conectar');
  if (!modal) return;

  modal.classList.remove('oculto');

  // Verificar si ya está conectado
  try {
    const data = await WhatsAppAPI.obtenerEstado();
    if (data?.ok && data.conectado) {
      mostrarStepWA('ok');
      return;
    }
  } catch (err) {
    console.warn('[wa] estado check:', err.message);
  }

  mostrarStepWA('inicio');
}

function mostrarStepWA(step) {
  const steps = ['inicio', 'numero', 'qr', 'codigo', 'ok', 'error'];
  steps.forEach(s => {
    const el = document.getElementById(`wa-step-${s}`);
    if (el) el.classList.toggle('oculto', s !== step);
  });
}

async function iniciarConexionQR() {
  mostrarStepWA('qr');
  const container = document.getElementById('wa-qr-container');
  if (container) {
    container.innerHTML = '<p style="text-align:center;color:var(--gris)">Generando QR...</p>';
  }

  try {
    const data = await WhatsAppAPI.conectar();

    if (!data?.ok) {
      mostrarErrorWA(data?.error || 'No se pudo generar el QR');
      return;
    }

    if (data.qr) {
      const src = data.qr.startsWith('data:') ? data.qr : `data:image/png;base64,${data.qr}`;
      container.innerHTML = `<img src="${src}" alt="QR WhatsApp">`;
    } else if (data.code) {
      container.innerHTML = `<p style="color:var(--gris);word-break:break-all">${data.code}</p>`;
    } else {
      mostrarErrorWA('No se recibió ningún código');
      return;
    }

    iniciarPollingEstado();

  } catch (err) {
    mostrarErrorWA(err.message || 'Error de conexión');
  }
}

async function iniciarConexionCodigo() {
  const input = document.getElementById('wa-input-telefono');
  const telefono = (input?.value || '').replace(/\D/g, '');

  if (!telefono || telefono.length < 10) {
    alert('Ingresá un número válido con código de país.\nEj: 5491112345678');
    return;
  }

  mostrarStepWA('codigo');
  const codigoEl = document.getElementById('wa-pairing-code');
  if (codigoEl) codigoEl.textContent = 'Generando...';

  try {
    const data = await WhatsAppAPI.conectar(telefono);

    if (!data?.ok) {
      mostrarErrorWA(data?.error || 'No se pudo generar el código');
      return;
    }

    const pairing = data.pairingCode || data.code;
    if (!pairing) {
      mostrarErrorWA('No se recibió el código de emparejamiento');
      return;
    }

    const formateado = pairing.length === 8
      ? `${pairing.slice(0,4)}-${pairing.slice(4)}`
      : pairing;
    codigoEl.textContent = formateado;

    iniciarPollingEstado();

  } catch (err) {
    mostrarErrorWA(err.message || 'Error de conexión');
  }
}

function iniciarPollingEstado() {
  if (waPollingInterval) clearInterval(waPollingInterval);

  let intentos = 0;
  const MAX_INTENTOS = 60; // 3 min

  waPollingInterval = setInterval(async () => {
    intentos++;

    if (intentos >= MAX_INTENTOS) {
      clearInterval(waPollingInterval);
      waPollingInterval = null;
      return;
    }

    try {
      const data = await WhatsAppAPI.obtenerEstado();
      if (data?.ok && data.conectado) {
        clearInterval(waPollingInterval);
        waPollingInterval = null;
        mostrarStepWA('ok');
      }
    } catch (err) {
      console.warn('[wa polling]', err.message);
    }
  }, 3000);
}

function mostrarErrorWA(msg) {
  mostrarStepWA('error');
  const el = document.getElementById('wa-error-msg');
  if (el) el.textContent = msg;
}

// Limpiar polling al cerrar el modal
document.addEventListener('click', (e) => {
  if (e.target.closest('#modal-wa-conectar .btn-cerrar-modal')) {
    if (waPollingInterval) {
      clearInterval(waPollingInterval);
      waPollingInterval = null;
    }
  }
});

    // Descartar
    lista.querySelectorAll('.wa-btn-eliminar').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        if (!confirm('¿Descartar este mensaje pendiente?')) return;
        await WaAPI.eliminar(id);
        await actualizarBadgeWa();
        await cargarWaPendientes();
      });
    });

  } catch (err) {
    console.error('[wa] cargarWaPendientes:', err.message);
    lista.innerHTML = '<p class="wa-vacio">Error al cargar mensajes</p>';
  }
}

function tiempoRelativoCorto(fechaISO) {
  const fecha = new Date(fechaISO);
  const ahora = new Date();
  const min = Math.floor((ahora - fecha) / 60000);
  if (min < 1)    return 'Ahora';
  if (min < 60)   return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
} 