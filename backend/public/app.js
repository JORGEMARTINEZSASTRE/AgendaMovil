'use strict';

// ═══════════════════════════════════════════════════════════
//  APP.JS — DEPIMÓVIL PRO
//  Versión SaaS — consume API REST con JWT
// ═══════════════════════════════════════════════════════════

// ─── UTILIDADES DE TELÉFONO ────────────────────────────────
// Normaliza a formato internacional (+598...) para guardar
function normalizarTelefono(raw, codigoPais = '598') {
  const limpio = String(raw || '').replace(/\D/g, '');
  if (!limpio) return '';

  // Si ya empieza con +, extraer código de país
  if (String(raw).trim().startsWith('+')) {
    // Detectar código de país
    if (limpio.startsWith('598')) return '+' + limpio;
    if (limpio.startsWith('54'))  return '+' + limpio;
    return '+' + limpio; // fallback
  }

  // Quitar 0 inicial si existe
  let numero = limpio.startsWith('0') ? limpio.slice(1) : limpio;
  return '+' + codigoPais + numero;
}

// Convierte formato internacional a local para mostrar (+59892787477 → 092787477)
function formatearTelefonoDisplay(raw) {
  const tel = String(raw || '').replace(/\D/g, '');
  if (!tel) return raw || '';

  if (tel.startsWith('598') && tel.length > 3) {
    return '0' + tel.slice(3);
  }
  if (tel.startsWith('54') && tel.length > 2) {
    return '0' + tel.slice(2);
  }
  // Si no tiene código de país reconocido, devolver con 0 si no lo tiene
  return tel.startsWith('0') ? tel : '0' + tel;
}

// ─── ESTADO EN MEMORIA ───────────────────────────────────────
let turnos        = [];
let servicios     = [];
let sucursales    = [];
let clientes        = [];
let clientesManuales = [];
let profesionales = [];
let config      = {
  plantilla_turno:  '',
  plantilla_cumple: '',
};

let tabActual              = 'agenda';
let fechaSeleccionada      = hoy();
let editandoId             = null;
let editandoServId         = null;
let editandoProfId         = null;
let filtroProfesionalId    = null;
let mesCalendario          = new Date();
let cargando               = false;
const DIAS_SEMANA_SUC = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

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
    const [turnosData, serviciosData, configData, sucursalesData, profesionalesData] = await Promise.all([
      apiCall(() => TurnosAPI.getAll(),          'Error al cargar turnos'),
      apiCall(() => ServiciosAPI.getAll(),       'Error al cargar servicios'),
      apiCall(() => ConfigAPI.get(),             'Error al cargar configuración'),
      apiCall(() => SucursalesAPI.listar(),      'Error al cargar sucursales'),
      apiCall(() => ProfesionalesAPI.getAll(),   'Error al cargar profesionales'),
    ]);

    turnos        = turnosData        || [];
    servicios     = serviciosData     || [];
    sucursales    = sucursalesData    || [];
    profesionales = profesionalesData || [];

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

  // Mostrar logo del usuario
  const logoImg = document.getElementById('header-logo');
  if (logoImg && usuario.logo_url) {
    logoImg.src = usuario.logo_url;
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
    case 'agenda':     renderAgenda();     cargarContactosParaTurno(); break;
    case 'calendario': renderCalendario(); break;
    case 'servicios':  renderServicios();  break;
    case 'cumples':    renderCumples();    break;
    case 'sucursales': renderSucursalesOperadora(); break;
    case 'clientes':   renderClientes();   break;
    case 'cuponeras':  renderCuponeras();  break;
    case 'caja':       renderCaja();       break;
  }
}

function irATab(tab) {
  if (tab === tabActual) return;
  tabActual = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('activo', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('activo', p.dataset.panel === tab);
  });
  renderTabActual();
  if (tab === 'agenda') cargarContactosParaTurno();
  if (tab === 'clientes') cargarContactosParaTurno();
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

  const btnNuevaSucursal = document.getElementById('btn-nueva-sucursal-operadora');
  if (btnNuevaSucursal) {
    btnNuevaSucursal.addEventListener('click', abrirModalNuevaSucursalOperadora);
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

  const turnosFechaBase = turnosDeFecha(fechaSeleccionada)
    .sort((a, b) => horaAMinutos(a.hora) - horaAMinutos(b.hora));

  // Filtro por profesional
  const turnosFecha = filtroProfesionalId
    ? turnosFechaBase.filter(t => t.profesional_id === filtroProfesionalId)
    : turnosFechaBase;

  // Renderizar filtros de profesional si hay profesionales cargados
  renderFiltrosProfesional();

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
            <button class="btn-icon btn-ficha"  data-id="${t.id}" title="Ficha clínica">🗂️</button>
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
        <p class="turno-tel">📞 ${escaparHTML(formatearTelefonoDisplay(t.telefono))}</p>
        ${t.servicio_nombre ? `
          <p class="turno-servicio" style="color:${c.borde}">
            ✨ ${escaparHTML(t.servicio_nombre)}
            ${t.servicio_zona ? `· ${escaparHTML(t.servicio_zona)}` : ''}
          </p>` : ''}
        ${t.sucursal_nombre ? `<p class="turno-duracion">🏪 ${escaparHTML(t.sucursal_nombre)}</p>` : ''}
        <p class="turno-duracion">⏱ ${t.duracion} min</p>
        ${t.profesional_nombre ? `<span class="turno-profesional-badge" style="background:${profesionales.find(p=>p.id===t.profesional_id)?.color||'#A85568'}">👩‍⚕️ ${escaparHTML(t.profesional_nombre)}</span>` : ''}
        ${t.notas ? `<p class="turno-notas">📝 ${escaparHTML(t.notas)}</p>` : ''}
        ${t.senia_requerida ? `
          <div class="turno-senia-wrap">
            ${t.senia_pagada
              ? `<span class="turno-senia-badge pagada">✅ Seña pagada — $${t.monto_senia}</span>`
              : t.senia_eximida
              ? `<span class="turno-senia-badge eximida">🤝 Seña liberada — no se cobró</span>`
              : `<span class="turno-senia-badge pendiente">⚠️ Seña pendiente — $${t.monto_senia}</span>
                 <button class="btn-confirmar-senia" data-id="${t.id}" title="La clienta pagó la seña">
                   Confirmar seña ✅
                 </button>
                 <button class="btn-eximir-senia" data-id="${t.id}" title="Confirmar el turno sin cobrar la seña">
                   Liberar 🤝
                 </button>`
            }
          </div>` : ''}
        ${t.confirmacion_estado === 'confirmado'
          ? `<span class="turno-confirma ok">✅ Confirmó que viene</span>`
          : t.confirmacion_estado === 'pendiente'
          ? `<span class="turno-confirma esperando">⏳ Le preguntamos, todavía no contestó</span>`
          : ''}
        ${t.estado !== 'cancelado' ? `
          <div class="turno-cobro-wrap">
            ${t.cobrado
              ? `<span class="turno-cobro-badge cobrado">💵 Cobrado</span>`
              : `<button class="btn-cobrar-turno" data-id="${t.id}" title="Registrar el cobro en la caja">
                   💵 Cobrar
                 </button>`
            }
          </div>` : ''}
      </div>
    </div>`;
}


function bindAccionesTurnos(contenedor) {
 contenedor.querySelectorAll('.btn-ficha').forEach(btn => {
  btn.addEventListener('click', () => {
    const turno = turnos.find(t => String(t.id) === String(btn.dataset.id));
    if (turno) abrirFicha(turno.telefono, turno.nombre, turno.id);
  });
});

 contenedor.querySelectorAll('.btn-wa').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const turno = turnos.find(t => String(t.id) === String(btn.dataset.id));
    if (turno) abrirWhatsApp(turno);
  });
});

  contenedor.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', () => {
      const turno = turnos.find(t => String(t.id) === String(btn.dataset.id));
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

  contenedor.querySelectorAll('.btn-eximir-senia').forEach(btn => {
    btn.addEventListener('click', () => liberarSenia(btn.dataset.id));
  });

  contenedor.querySelectorAll('.btn-cobrar-turno').forEach(btn => {
    btn.addEventListener('click', () => abrirModalCobro(btn.dataset.id));
  });
}

// ═══════════════════════════════════════════════════════════
//  FORMULARIO TURNO
// ═══════════════════════════════════════════════════════════
function bindFormTurno() {
  const form = document.getElementById('form-turno');
  if (!form) return;
  form.addEventListener('submit', handleSubmitTurno);

  // Al elegir servicio: autocompletar datos + aviso seña
  const selectServ = document.getElementById('turno-servicio-id');
  if (selectServ) {
    selectServ.addEventListener('change', () => {
      const serv = servicios.find(s => s.id === selectServ.value);
      const avisoSenia = document.getElementById('turno-senia-aviso');
      const montoEl    = document.getElementById('turno-senia-monto');

      if (serv) {
        setVal('turno-duracion',       serv.duracion);
        setVal('turno-servicio-zona',  serv.zona);
        setVal('turno-servicio-color', serv.color);

        // Mostrar/ocultar aviso seña
        if (serv.requiere_senia && serv.monto_senia > 0) {
          avisoSenia?.classList.remove('oculto');
          if (montoEl) montoEl.textContent = `$${serv.monto_senia}`;
        } else {
          avisoSenia?.classList.add('oculto');
        }

        // Recargar horarios con la duración nueva
        const fecha = getVal('turno-fecha');
        if (fecha) cargarHorariosDisponibles(fecha);
      } else {
        avisoSenia?.classList.add('oculto');
      }
    });
  }

  const selectSucursal = document.getElementById('turno-sucursal-id');
  if (selectSucursal) {
    selectSucursal.addEventListener('change', () => {
      const fecha = getVal('turno-fecha');
      if (fecha && selectSucursal.value) cargarHorariosDisponibles(fecha);
    });
  }

  // Al cambiar fecha: cargar horarios disponibles
  const inputFecha = document.getElementById('turno-fecha');
  if (inputFecha) {
    inputFecha.addEventListener('change', () => {
      const sucId = getVal('turno-sucursal-id');
      if (inputFecha.value && sucId) cargarHorariosDisponibles(inputFecha.value);
    });
  }

  // Al cambiar duración manual: recargar horarios
  const inputDuracion = document.getElementById('turno-duracion');
  if (inputDuracion) {
    inputDuracion.addEventListener('change', () => {
      const fecha = getVal('turno-fecha');
      if (fecha) cargarHorariosDisponibles(fecha);
    });
  }
}

async function cargarContactosParaTurno() {
  try {
    const [auto, manuales] = await Promise.all([
      ClientesAPI.getAll(),
      ClientesAPI.getManuales(),
    ]);
    clientes = auto;
    clientesManuales = manuales;
  } catch (e) {
    // Silencioso, ya se cargan en renderClientes
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

  // Poblar selector de sucursales
  const selectSucursal = document.getElementById('turno-sucursal-id');
  if (selectSucursal) {
    selectSucursal.innerHTML = '<option value="">— Elegí ubicación —</option>' +
      (sucursales || []).map(s => {
        const icono = s.tipo === 'profesional' ? '👤' : '🏪';
        return `
          <option value="${s.id}" ${String(turno?.sucursal_id || '') === String(s.id) ? 'selected' : ''}>
            ${icono} ${escaparHTML(s.nombre || 'Sucursal')}
          </option>`;
      }).join('');
  }

  // Poblar selector de profesional
  const selectProf = document.getElementById('turno-profesional');
  const campoProf  = document.getElementById('campo-profesional');
  if (selectProf) {
    if (profesionales.length > 0) {
      if (campoProf) campoProf.style.display = '';
      selectProf.innerHTML = '<option value="">— Sin asignar —</option>' +
        profesionales.map(p =>
          `<option value="${p.id}" ${turno?.profesional_id === p.id ? 'selected' : ''}>
            ${escaparHTML(p.nombre)}
          </option>`
        ).join('');
    } else {
      if (campoProf) campoProf.style.display = 'none';
    }
  }

  // Poblar selector de servicios (con indicador de seña)
  const selectServ = document.getElementById('turno-servicio-id');
  if (selectServ) {
    selectServ.innerHTML =
      `<option value="">— Sin servicio —</option>` +
      servicios.map(s => {
        const label = `${escaparHTML(s.nombre)} · ${escaparHTML(s.zona)}${s.requiere_senia ? ' 💰' : ''}`;
        return `<option value="${s.id}" ${turno?.servicio_id === s.id ? 'selected' : ''}>${label}</option>`;
      }).join('');
  }

  // Poblar selector de contactos
  const selectContacto = document.getElementById('turno-contacto-select');
  if (selectContacto) {
    const todosContactos = [...(clientes || []), ...(clientesManuales || [])];
    const unicos = new Map();
    for (const c of todosContactos) {
      if (!unicos.has(c.telefono) || c.favorito) unicos.set(c.telefono, c);
    }
    const lista = [...unicos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    selectContacto.innerHTML = '<option value="">— Escribir manualmente —</option>' +
      lista.map(c =>
        `<option value="${escaparHTML(c.telefono)}" data-nombre="${escaparHTML(c.nombre)}" data-favorito="${c.favorito ? '1' : '0'}">
          ${c.favorito ? '⭐ ' : ''}${escaparHTML(c.nombre)} — ${escaparHTML(formatearTelefonoDisplay(c.telefono))}
        </option>`
      ).join('');

    selectContacto.onchange = () => {
      const opt = selectContacto.options[selectContacto.selectedIndex];
      if (opt && opt.value) {
        setVal('turno-nombre', opt.dataset.nombre);
        const tel = opt.value.replace(/\D/g, '');
        if (tel.startsWith('598')) {
          setVal('turno-codigo-pais', '598');
          setVal('turno-telefono', tel.slice(3));
        } else if (tel.startsWith('54')) {
          setVal('turno-codigo-pais', '54');
          setVal('turno-telefono', tel.slice(2));
        } else {
          setVal('turno-codigo-pais', '598');
          setVal('turno-telefono', tel);
        }
      }
    };
  }

  // Setear fecha mínima (hoy) excepto si estoy editando
  const inputFecha = document.getElementById('turno-fecha');
  if (inputFecha && !turno) {
    inputFecha.min = new Date().toISOString().split('T')[0];
  }

  if (turno) {
    setVal('turno-nombre', turno.nombre);

    // Separar teléfono en código país + número
    const tel = String(turno.telefono || '').replace(/\D/g, '');
    if (tel.startsWith('598')) {
      setVal('turno-codigo-pais', '598');
      setVal('turno-telefono',    tel.slice(3));
    } else if (tel.startsWith('54')) {
      setVal('turno-codigo-pais', '54');
      setVal('turno-telefono',    tel.slice(2));
    } else {
      setVal('turno-codigo-pais', '598');
      setVal('turno-telefono',    tel);
    }

    setVal('turno-email',          turno.email_clienta   || '');
    setVal('turno-fecha',          turno.fecha);
    setVal('turno-duracion',       turno.duracion);
    setVal('turno-servicio-zona',  turno.servicio_zona   || '');
    setVal('turno-servicio-color', turno.servicio_color  || '#A85568');
    setVal('turno-notas',          turno.notas           || '');
    setVal('turno-cumple-dia',     turno.cumple_dia      || '');
    setVal('turno-cumple-mes',     turno.cumple_mes      || '');

    // Cargar horarios disponibles y seleccionar el del turno
    if (getVal('turno-sucursal-id')) {
      cargarHorariosDisponibles(turno.fecha, formatearHora(turno.hora));
    }

    // Disparar el change del servicio para mostrar aviso de seña si aplica
    if (turno.servicio_id && selectServ) {
      selectServ.dispatchEvent(new Event('change'));
    }

  } else {
    setVal('turno-fecha',          fechaSeleccionada);
    setVal('turno-servicio-color', '#A85568');
    setVal('turno-codigo-pais',    '598');
    const selectContacto = document.getElementById('turno-contacto-select');
    if (selectContacto) selectContacto.value = '';

    // Si hay una sola sucursal, seleccionarla por defecto
    if (!turno && (sucursales || []).length === 1) {
      setVal('turno-sucursal-id', sucursales[0].id);
    }

    // Cargar horarios de la fecha seleccionada
    if (fechaSeleccionada && getVal('turno-sucursal-id')) {
      cargarHorariosDisponibles(fechaSeleccionada);
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
// ═══════════════════════════════════════════════════════════
//  Cargar horarios disponibles según fecha y duración
// ═══════════════════════════════════════════════════════════
async function cargarHorariosDisponibles(fecha, horaSeleccionada = null) {
  const selectHora = document.getElementById('turno-hora');
  if (!selectHora) return;

  selectHora.innerHTML = '<option value="">Cargando...</option>';

  const sucursalId = getVal('turno-sucursal-id');
  if (!sucursalId) {
    selectHora.innerHTML = '<option value="">— Primero elegí sucursal —</option>';
    return;
  }

  // Traer los turnos del día
  let ocupados = [];
  try {
    const turnosDelDia = await TurnosAPI.getAll({ fecha });
    ocupados = (turnosDelDia || []).filter(t => {
      // Si estoy editando, excluir el propio turno
      if (editandoId && t.id === editandoId) return false;
      if (t.estado === 'cancelado') return false;
      return String(t.sucursal_id || '') === String(sucursalId);
    });
  } catch (err) {
    console.warn('[horarios] error cargando turnos del día:', err.message);
  }

  const duracion = parseInt(getVal('turno-duracion')) || 30;

  selectHora.innerHTML = '<option value="">— Elegí un horario —</option>';

  for (let m = 7 * 60; m <= 20 * 60; m += 15) {
    const hora    = minutosAHora(m);
    const horaFin = m + duracion;
    if (horaFin > 20 * 60) continue;

    const ocupado = ocupados.some(t => {
      const tMin = horaAMinutos(formatearHora(t.hora));
      const tFin = tMin + parseInt(t.duracion);
      return m < tFin && horaFin > tMin;
    });

    const opt = document.createElement('option');
    opt.value       = hora;
    opt.textContent = ocupado ? `${hora} — Ocupado` : `${hora} — Disponible`;
    opt.disabled    = ocupado;
    if (ocupado) opt.style.color = '#B09590';
    if (horaSeleccionada === hora) opt.selected = true;
    selectHora.appendChild(opt);
  }
}

async function handleSubmitTurno(e) {
  e.preventDefault();

  const nombre         = getVal('turno-nombre').trim();
  const sucursalId     = getVal('turno-sucursal-id');
  const telefonoRaw    = getVal('turno-telefono').trim();
  const codigoPais     = getVal('turno-codigo-pais') || '598';
  const email          = getVal('turno-email').trim()  || null;
  const fecha          = getVal('turno-fecha');
  const hora           = getVal('turno-hora');
  const duracion       = parseInt(getVal('turno-duracion'));
  const servicioId     = getVal('turno-servicio-id')     || null;
  const servicioZona   = getVal('turno-servicio-zona')   || null;
  const servicioColor  = getVal('turno-servicio-color')  || '#A85568';
  const notas          = getVal('turno-notas')           || null;
  const cumpleDia      = parseInt(getVal('turno-cumple-dia')) || null;
  const cumpleMes      = parseInt(getVal('turno-cumple-mes')) || null;

  // Armar teléfono con código de país
  let telefonoLimpio = telefonoRaw.replace(/\D/g, '');
  if (telefonoLimpio.startsWith('0')) telefonoLimpio = telefonoLimpio.slice(1);
  const telefono = '+' + codigoPais + telefonoLimpio;

  // Buscar nombre del servicio por ID (del array local)
  const servicio       = servicios.find(s => s.id === servicioId);
  const servicioNombre = servicio?.nombre || null;

  // Profesional seleccionado
  const profesionalId  = getVal('turno-profesional') || null;
  const profesional    = profesionales.find(p => p.id === profesionalId);
  const profesionalNombre = profesional?.nombre || null;

  // Validaciones frontend
  if (!nombre || !telefonoLimpio || !fecha || !hora || !duracion) {
    mostrarErrorForm('form-turno-error', 'Completá todos los campos obligatorios');
    return;
  }

  if (telefonoLimpio.length < 7) {
    mostrarErrorForm('form-turno-error', 'Número de teléfono inválido');
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
    cumple_dia:         cumpleDia,
    cumple_mes:         cumpleMes,
    sucursal_id:        sucursalId,
    profesional_id:     profesionalId,
    profesional_nombre: profesionalNombre,
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

/**
 * Libera el turno sin cobrar la seña.
 * A diferencia de confirmarPagoSenia, acá la plata no entró: queda
 * registrado como eximida para no ensuciar los números de ingresos.
 */
async function liberarSenia(id) {
  const turno = turnos.find(t => String(t.id) === String(id));
  if (!turno) return;

  if (!confirm(
    `¿Liberar el turno de ${turno.nombre} sin cobrarle la seña de $${turno.monto_senia}?\n\n` +
    `El turno queda confirmado y se registra como seña liberada, no como pagada.`
  )) return;

  try {
    const data = await TurnosAPI.eximirSenia(id);
    if (!data?.ok) { mostrarToast(data?.error || 'Error al liberar', 'error'); return; }
    turnos = turnos.map(t => String(t.id) === String(id) ? data.turno : t);
    mostrarToast('🤝 Seña liberada', 'exito');
    renderTabActual();
  } catch(err) {
    mostrarToast(err.message || 'Error al liberar la seña', 'error');
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
function capitalizarDia(fechaStr) {
  try {
    if (!fechaStr) return '';

    // Normalizar: dejar solo YYYY-MM-DD
    const soloFecha = String(fechaStr).split('T')[0];

    // Parsear como fecha local (para evitar problemas de zona horaria)
    const [anio, mes, dia] = soloFecha.split('-').map(Number);
    const fecha = new Date(anio, mes - 1, dia, 12, 0, 0);

    if (isNaN(fecha.getTime())) return '';

    const nombreDia = fecha.toLocaleDateString('es-AR', { weekday: 'long' });
    return nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1);
  } catch {
    return '';
  }
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
    ${capitalizarDia(fecha)} ${formatearFecha(fecha)}
      </div>
      ${ts.map(t => `
        <div class="timeline-item" style="border-left:3px solid ${t.servicio_color || '#A85568'}">
          <span class="timeline-hora">${formatearHora(t.hora)}</span>
          <span class="timeline-nombre">${escaparHTML(t.nombre)}</span>
          ${t.servicio_nombre
            ? `<span class="timeline-serv">${escaparHTML(t.servicio_nombre)}</span>`
            : ''}
          ${t.sucursal_nombre
            ? `<span class="timeline-serv">🏪 ${escaparHTML(t.sucursal_nombre)}</span>`
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
        <span class="empty-icono">${textoBusqueda ? '🔍' : '✨'}</span>
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
      ${s.foto_url ? `<div class="serv-foto-card"><img src="${s.foto_url}" alt="${escaparHTML(s.nombre)}" loading="lazy"></div>` : ''}
      <div class="serv-info">
        <p class="serv-nombre">${escaparHTML(s.nombre)}</p>
        <p class="serv-zona">📍 ${escaparHTML(s.zona || '')}</p>
        <p class="serv-duracion">⏱ ${s.duracion} min${s.precio ? ` · 💲 $${Number(s.precio).toLocaleString('es-AR')}` : ''}${s.requiere_senia ? ` · 💰 Seña $${s.monto_senia}` : ''}</p>
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
const MAX_FOTOS_SERVICIO = 8;
let fotosServicio   = [];  // fotos ya guardadas del servicio en edición
let fotosPendientes = [];  // archivos elegidos, se suben al guardar

function bindFormServicio() {
  const form = document.getElementById('form-servicio');
  if (!form) return;
  form.addEventListener('submit', handleSubmitServicio);

  // Toggle seña
  const toggleSenia = document.getElementById('serv-requiere-senia');
  const montoWrap   = document.getElementById('serv-senia-monto-wrap');
  if (toggleSenia && montoWrap) {
    toggleSenia.addEventListener('change', () => {
      montoWrap.classList.toggle('oculto', !toggleSenia.checked);
      if (!toggleSenia.checked) {
        setVal('serv-monto-senia', '');
        setVal('serv-senia-porcentaje', '');
      }
    });
  }

  // Monto fijo o porcentaje del precio
  const tipoSenia = document.getElementById('serv-senia-tipo');
  if (tipoSenia) {
    tipoSenia.addEventListener('change', aplicarTipoSenia);
  }
  ['serv-senia-porcentaje', 'serv-precio'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', mostrarCalculoSenia);
  });

  // Galería de fotos
  const fotosInput = document.getElementById('serv-fotos-input');
  if (fotosInput) {
    fotosInput.addEventListener('change', (e) => {
      agregarFotosPendientes(Array.from(e.target.files || []));
      fotosInput.value = ''; // permitir volver a elegir el mismo archivo
    });
  }
}

/** Muestra el campo que corresponde según cómo se cobre la seña. */
function aplicarTipoSenia() {
  const esPorcentaje = getVal('serv-senia-tipo') === 'porcentaje';
  document.getElementById('serv-senia-fijo')?.classList.toggle('oculto', esPorcentaje);
  document.getElementById('serv-senia-pct')?.classList.toggle('oculto', !esPorcentaje);
  mostrarCalculoSenia();
}

/** "30% de $1500 = $450", para que no haya que hacer la cuenta a mano. */
function mostrarCalculoSenia() {
  const el = document.getElementById('serv-senia-calculo');
  if (!el) return;

  const precio     = parseFloat(getVal('serv-precio')) || 0;
  const porcentaje = parseFloat(getVal('serv-senia-porcentaje')) || 0;

  if (!porcentaje) { el.textContent = ''; return; }
  if (!precio) {
    el.textContent = 'Cargá el precio del servicio para ver cuánto sería la seña.';
    return;
  }

  const monto = Math.round(precio * porcentaje / 100);
  el.textContent = `${porcentaje}% de $${precio.toLocaleString('es-UY')} = $${monto.toLocaleString('es-UY')} de seña.`;
}

// ── Galería de fotos del servicio ──────────────────────────
// fotosServicio  = las que ya están guardadas (tienen id y url)
// fotosPendientes = archivos elegidos que se suben al guardar

function agregarFotosPendientes(archivos) {
  const errorEl = document.getElementById('serv-fotos-error');
  const lugar = MAX_FOTOS_SERVICIO - (fotosServicio.length + fotosPendientes.length);

  if (lugar <= 0) {
    mostrarErrorForm('serv-fotos-error', `Máximo ${MAX_FOTOS_SERVICIO} fotos. Borrá alguna para agregar otra.`);
    return;
  }

  const rechazadas = [];
  for (const file of archivos) {
    if (fotosPendientes.length + fotosServicio.length >= MAX_FOTOS_SERVICIO) {
      rechazadas.push(`${file.name}: no entra, ya son ${MAX_FOTOS_SERVICIO}`);
      continue;
    }
    if (!file.type.startsWith('image/')) {
      rechazadas.push(`${file.name}: no es una imagen`);
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      rechazadas.push(`${file.name}: pesa más de 5 MB`);
      continue;
    }
    fotosPendientes.push(file);
  }

  if (rechazadas.length) mostrarErrorForm('serv-fotos-error', rechazadas.join('. '));
  else if (errorEl) errorEl.classList.add('oculto');

  renderFotosServicio();
}

function renderFotosServicio() {
  const grid = document.getElementById('serv-fotos-grid');
  if (!grid) return;

  const guardadas = fotosServicio.map((f, i) => `
    <div class="serv-foto-item">
      <img src="${f.url}" alt="Foto ${i + 1}" loading="lazy">
      ${i === 0 ? '<span class="serv-foto-portada">Portada</span>' : ''}
      <button type="button" class="btn-quitar-foto" data-foto-id="${f.id}" title="Borrar foto">✕</button>
    </div>
  `);

  const pendientes = fotosPendientes.map((file, i) => `
    <div class="serv-foto-item serv-foto-pendiente">
      <img src="${URL.createObjectURL(file)}" alt="${escaparHTML(file.name)}">
      <span class="serv-foto-nueva">Nueva</span>
      <button type="button" class="btn-quitar-foto" data-pendiente="${i}" title="Quitar">✕</button>
    </div>
  `);

  grid.innerHTML = [...guardadas, ...pendientes].join('') ||
    '<p class="serv-fotos-vacio">Todavía no cargaste fotos.</p>';

  grid.querySelectorAll('[data-foto-id]').forEach(btn => {
    btn.addEventListener('click', () => borrarFotoGuardada(btn.dataset.fotoId));
  });
  grid.querySelectorAll('[data-pendiente]').forEach(btn => {
    btn.addEventListener('click', () => {
      fotosPendientes.splice(Number(btn.dataset.pendiente), 1);
      renderFotosServicio();
    });
  });
}

async function borrarFotoGuardada(fotoId) {
  if (!editandoServId) return;
  try {
    await ServiciosAPI.eliminarFotoGaleria(editandoServId, fotoId);
    fotosServicio = fotosServicio.filter(f => String(f.id) !== String(fotoId));
    sincronizarPortadaLocal();
    renderFotosServicio();
  } catch (err) {
    mostrarErrorForm('serv-fotos-error', detalleError(err, 'No se pudo borrar la foto'));
  }
}

/** Deja el servicio local con la misma portada que quedó en el servidor. */
function sincronizarPortadaLocal() {
  const idx = servicios.findIndex(s => String(s.id) === String(editandoServId));
  if (idx !== -1) servicios[idx].foto_url = fotosServicio[0]?.url || null;
}

/** Sube las fotos pendientes de un servicio ya creado. */
async function subirFotosPendientes(servId) {
  if (!fotosPendientes.length) return;
  const data = await ServiciosAPI.subirFotos(servId, fotosPendientes);
  fotosPendientes = [];
  const idx = servicios.findIndex(s => String(s.id) === String(servId));
  if (idx !== -1) servicios[idx].foto_url = data?.portada || servicios[idx].foto_url;
  if (data?.mensaje) mostrarToast(data.mensaje, 'error');
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
    setVal('serv-precio',      serv.precio ?? '');   
    setVal('serv-categoria',   serv.categoria || '');
    setVal('serv-zona',        serv.zona);
    setVal('serv-duracion',    serv.duracion);
    setVal('serv-color',       serv.color || '#A85568');
    setVal('serv-descripcion', serv.descripcion || '');

    if (toggleSenia) toggleSenia.checked = !!serv.requiere_senia;
    if (montoWrap)   montoWrap.classList.toggle('oculto', !serv.requiere_senia);

    setVal('serv-senia-tipo',       serv.senia_tipo || 'monto');
    setVal('serv-monto-senia',      serv.monto_senia || '');
    setVal('serv-senia-porcentaje', Number(serv.senia_porcentaje) || '');
    aplicarTipoSenia();

    // Traer la galería del servicio
    cargarFotosServicio(serv.id);
  } else {
    setVal('serv-color', '#A85568');
    setVal('serv-categoria', '');
    if (toggleSenia) toggleSenia.checked = false;
    if (montoWrap)   montoWrap.classList.add('oculto');
    setVal('serv-senia-tipo', 'monto');
    setVal('serv-monto-senia', '');
    setVal('serv-senia-porcentaje', '');
    aplicarTipoSenia();
  }

  modal?.classList.remove('oculto');

  // Poblar checkboxes de sucursales
  const checksContainer = document.getElementById('serv-sucursales-checks');
  const wrap = document.getElementById('serv-sucursales-wrap');
  if (checksContainer) {
    if (!sucursales.length) {
      if (wrap) wrap.classList.add('oculto');
    } else {
      if (wrap) wrap.classList.remove('oculto');
      const seleccionadas = serv?.sucursal_ids || [];
      checksContainer.innerHTML = sucursales.map(s => `
        <label class="sucursal-check-item">
          <input type="checkbox" name="serv-sucursal" value="${s.id}"
            ${seleccionadas.includes(s.id) ? 'checked' : ''}>
          ${escaparHTML(s.nombre)}
        </label>
      `).join('');
    }
  }
}

function limpiarFormServicio() {
  const form = document.getElementById('form-servicio');
  if (form) form.reset();
  const errEl = document.getElementById('form-servicio-error');
  if (errEl) errEl.classList.add('oculto');

  // Limpiar la galería
  const errFotos = document.getElementById('serv-fotos-error');
  if (errFotos) errFotos.classList.add('oculto');
  const inputFotos = document.getElementById('serv-fotos-input');
  if (inputFotos) inputFotos.value = '';
  fotosServicio   = [];
  fotosPendientes = [];
  renderFotosServicio();
}

/** Trae del servidor las fotos ya guardadas del servicio. */
async function cargarFotosServicio(servId) {
  try {
    fotosServicio = await ServiciosAPI.getFotos(servId);
  } catch {
    fotosServicio = [];
  }
  renderFotosServicio();
}

async function handleSubmitServicio(e) {
  e.preventDefault();

  const nombre      = getVal('serv-nombre').trim();
  const zona        = getVal('serv-zona').trim();
  const duracion    = parseInt(getVal('serv-duracion'));
  const color       = getVal('serv-color')       || '#A85568';
  const descripcion = getVal('serv-descripcion') || null;
  const categoria = getVal('serv-categoria').trim() || 'Sin categoría';
  const precio    = parseFloat(getVal('serv-precio')) || 0; 
  // Validaciones
  if (!nombre || !duracion) {
    mostrarErrorForm('form-servicio-error', 'Completá todos los campos obligatorios');
    return;
  }

  if (nombre.length < 2) {
    mostrarErrorForm('form-servicio-error', 'El nombre debe tener al menos 2 caracteres');
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
  const seniaTipo     = getVal('serv-senia-tipo') === 'porcentaje' ? 'porcentaje' : 'monto';
  const montoSenia    = requiereSenia && seniaTipo === 'monto'
    ? (parseFloat(getVal('serv-monto-senia')) || 0) : 0;
  const seniaPorcentaje = requiereSenia && seniaTipo === 'porcentaje'
    ? (parseFloat(getVal('serv-senia-porcentaje')) || 0) : 0;

  if (requiereSenia && seniaTipo === 'monto' && montoSenia <= 0) {
    mostrarErrorForm('form-servicio-error', 'Ingresá un monto válido para la seña');
    return;
  }

  if (requiereSenia && seniaTipo === 'porcentaje') {
    if (seniaPorcentaje <= 0 || seniaPorcentaje > 100) {
      mostrarErrorForm('form-servicio-error', 'El porcentaje de la seña debe estar entre 1 y 100');
      return;
    }
    if (precio <= 0) {
      mostrarErrorForm('form-servicio-error', 'Para cobrar la seña por porcentaje necesitás cargar el precio del servicio');
      return;
    }
  }

const payload = {
  nombre,
  categoria,
  zona,
  duracion,
  color,
  descripcion,
  requiere_senia:   requiereSenia,
  monto_senia:      montoSenia,
  senia_tipo:       seniaTipo,
  senia_porcentaje: seniaPorcentaje,
  precio:           precio,
  sucursal_ids: [...document.querySelectorAll('input[name="serv-sucursal"]:checked')].map(c => c.value),
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

    // Subir las fotos que se eligieron antes de guardar.
    // Las que se borraron ya se borraron al tocar la ✕, no hace falta nada acá.
    const servId = editandoServId || data.servicio?.id;
    if (servId) {
      try {
        await subirFotosPendientes(servId);
      } catch (e) {
        console.error('[FOTOS] Error al subir:', e.message);
        mostrarToast('El servicio se guardó, pero falló la subida de las fotos', 'error');
      }
    }

    cerrarModales();
    renderServicios();

  } catch (err) {
    mostrarErrorForm('form-servicio-error', detalleError(err, 'Error al guardar el servicio'));
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
          <p class="cumple-tel">📞 ${escaparHTML(formatearTelefonoDisplay(c.telefono))}</p>
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

  // Logo preview
  const logoInput = document.getElementById('config-logo-input');
  const logoPreview = document.getElementById('config-logo-preview');
  const logoImg = document.getElementById('config-logo-img');

  // Mostrar logo existente
  const usuario = Sesion.getUsuario();
  if (usuario?.logo_url && logoPreview && logoImg) {
    logoImg.src = usuario.logo_url;
    logoPreview.classList.remove('oculto');
  }

  if (logoInput) {
    logoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        mostrarToast('Solo se permiten imágenes', 'error');
        logoInput.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        mostrarToast('La imagen no debe superar 2MB', 'error');
        logoInput.value = '';
        return;
      }

      try {
        const data = await ConfigAPI.subirLogo(file);
        const headerLogo = document.getElementById('header-logo');
        if (headerLogo) headerLogo.src = data.logo_url;
        if (logoImg) logoImg.src = data.logo_url;
        if (logoPreview) logoPreview.classList.remove('oculto');

        const user = Sesion.getUsuario();
        user.logo_url = data.logo_url;
        localStorage.setItem('depimovil_usuario', JSON.stringify(user));

        mostrarToast('Logo actualizado ✅', 'exito');
      } catch (err) {
        mostrarToast(err.message || 'Error al subir logo', 'error');
      }
      logoInput.value = '';
    });
  }

  // Quitar logo
  const btnQuitarLogo = document.getElementById('btn-quitar-logo');
  if (btnQuitarLogo) {
    btnQuitarLogo.addEventListener('click', async () => {
      try {
        await ConfigAPI.eliminarLogo();
        if (logoPreview) logoPreview.classList.add('oculto');
        if (logoImg) logoImg.src = '';

        const headerLogo = document.getElementById('header-logo');
        if (headerLogo) headerLogo.src = 'logo.jpeg';

        const user = Sesion.getUsuario();
        user.logo_url = null;
        localStorage.setItem('depimovil_usuario', JSON.stringify(user));

        mostrarToast('Logo eliminado', 'info');
      } catch (err) {
        mostrarToast(err.message || 'Error al eliminar logo', 'error');
      }
    });
  }

  // Profesionales
  renderProfesionalesConfig();

  const btnNuevoProf = document.getElementById('btn-nuevo-profesional');
  if (btnNuevoProf) {
    btnNuevoProf.addEventListener('click', () => abrirModalProfesional());
  }

  const formProf = document.getElementById('form-profesional');
  if (formProf) {
    formProf.addEventListener('submit', handleSubmitProfesional);
  }
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
// ═══════════════════════════════════════════════════════════
//  CUPONERAS — paquetes de sesiones prepagas
//  La clienta paga varias sesiones adelantadas y las va usando.
//  Las usadas se cuentan por filas de historial, no con un
//  contador suelto: así se puede deshacer y nunca se desfasa.
// ═══════════════════════════════════════════════════════════
let cuponeras = [];
let cuponerasBindeado = false;
let cuponeraAbierta = null;

async function renderCuponeras() {
  if (!cuponerasBindeado) {
    document.getElementById('btn-nueva-cuponera')?.addEventListener('click', abrirFormCuponera);
    document.getElementById('form-cuponera')?.addEventListener('submit', handleSubmitCuponera);
    document.getElementById('cuponeras-ver-cerradas')?.addEventListener('change', cargarYRenderizarCuponeras);
    document.getElementById('buscar-cuponera')?.addEventListener('input', pintarCuponeras);
    ['cup-precio', 'cup-sesiones'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', mostrarPrecioPorSesion);
      document.getElementById(id)?.addEventListener('change', mostrarPrecioPorSesion);
    });
    cuponerasBindeado = true;
  }
  await cargarYRenderizarCuponeras();
}

async function cargarYRenderizarCuponeras() {
  const cont = document.getElementById('lista-cuponeras');
  if (!cont) return;
  cont.innerHTML = '<div class="pub-cargando">Cargando cuponeras...</div>';

  try {
    const verCerradas = document.getElementById('cuponeras-ver-cerradas')?.checked;
    cuponeras = await CuponerasAPI.getAll(verCerradas);
    pintarCuponeras();
  } catch (err) {
    cont.innerHTML = `<p class="cuponera-vacio">No se pudieron cargar: ${escaparHTML(err.message)}</p>`;
  }
}

function pintarCuponeras() {
  const cont = document.getElementById('lista-cuponeras');
  if (!cont) return;

  const filtro = (getVal('buscar-cuponera') || '').toLowerCase().trim();
  const lista = filtro
    ? cuponeras.filter(c =>
        (c.cliente_nombre || '').toLowerCase().includes(filtro) ||
        (c.cliente_telefono || '').includes(filtro))
    : cuponeras;

  if (!lista.length) {
    cont.innerHTML = filtro
      ? `<p class="cuponera-vacio">Sin resultados para "${escaparHTML(filtro)}"</p>`
      : `<div class="empty-state">
           <span class="empty-icono">🎟️</span>
           <p class="empty-titulo">Sin cuponeras todavía</p>
           <p class="empty-sub">Creá una cuando una clienta pague varias sesiones por adelantado</p>
         </div>`;
    return;
  }

  cont.innerHTML = lista.map(tarjetaCuponera).join('');

  cont.querySelectorAll('[data-usar]').forEach(b =>
    b.addEventListener('click', () => usarSesion(b.dataset.usar)));
  cont.querySelectorAll('[data-ver]').forEach(b =>
    b.addEventListener('click', () => verUsosCuponera(b.dataset.ver)));
  cont.querySelectorAll('[data-cerrar]').forEach(b =>
    b.addEventListener('click', () => cerrarCuponera(b.dataset.cerrar)));
}

function tarjetaCuponera(c) {
  const usadas    = Number(c.usadas) || 0;
  const total     = Number(c.total_sesiones) || 0;
  const restantes = Number(c.restantes) || 0;
  const progreso  = total ? Math.round(usadas / total * 100) : 0;

  // Un punto por sesión: se lee de un vistazo cuántas quedan
  const puntos = Array.from({ length: total }, (_, i) =>
    `<span class="cup-punto ${i < usadas ? 'usada' : ''}"></span>`).join('');

  const ultimo = c.ultimo_uso
    ? `Última: ${formatearFecha(c.ultimo_uso.toString().split('T')[0])}`
    : 'Todavía no usó ninguna';

  return `
    <div class="cuponera-card ${c.activa ? '' : 'cerrada'}">
      <div class="cuponera-top">
        <div>
          <p class="cuponera-nombre">${escaparHTML(c.cliente_nombre)}</p>
          <p class="cuponera-sub">📞 ${escaparHTML(formatearTelefonoDisplay(c.cliente_telefono))}</p>
          ${c.servicio_nombre ? `<p class="cuponera-sub">✨ ${escaparHTML(c.servicio_nombre)}</p>` : ''}
        </div>
        <div class="cuponera-contador">
          <span class="cuponera-restantes">${restantes}</span>
          <span class="cuponera-de">de ${total}</span>
        </div>
      </div>

      <div class="cuponera-puntos">${puntos}</div>
      <div class="cuponera-barra"><div class="cuponera-barra-fill" style="width:${progreso}%"></div></div>

      <p class="cuponera-sub">${ultimo}${Number(c.precio_total) > 0 ? ` · Pagó $${Number(c.precio_total).toLocaleString('es-UY')}` : ''}</p>

      <div class="cuponera-acciones">
        ${c.activa && restantes > 0
          ? `<button class="btn-cup-usar" data-usar="${c.id}">✔️ Usar una sesión</button>`
          : `<span class="cuponera-badge">${restantes <= 0 ? '🏁 Completa' : '🔒 Cerrada'}</span>`}
        <button class="btn-cup-ver" data-ver="${c.id}">📋 Historial</button>
        ${c.activa ? `<button class="btn-cup-cerrar" data-cerrar="${c.id}" title="Cerrar sin terminarla">🔒</button>` : ''}
      </div>
    </div>`;
}

async function usarSesion(id) {
  const c = cuponeras.find(x => String(x.id) === String(id));
  if (!c) return;

  if (!confirm(`¿Registrar una sesión usada de ${c.cliente_nombre}?\n\nLe quedarían ${Number(c.restantes) - 1} de ${c.total_sesiones}.`)) return;

  try {
    const data = await CuponerasAPI.usar(id);
    if (!data?.ok) { mostrarToast(data?.error || 'Error', 'error'); return; }
    mostrarToast(data.mensaje || 'Sesión registrada', 'exito');
    await cargarYRenderizarCuponeras();
  } catch (err) {
    mostrarToast(detalleError(err, 'No se pudo registrar la sesión'), 'error');
  }
}

async function verUsosCuponera(id) {
  cuponeraAbierta = id;
  const modal = document.getElementById('modal-cuponera-usos');
  const lista = document.getElementById('cup-usos-lista');
  document.getElementById('cup-usos-error')?.classList.add('oculto');
  lista.innerHTML = '<div class="pub-cargando">Cargando...</div>';
  modal?.classList.remove('oculto');

  try {
    const data = await CuponerasAPI.usos(id);
    const c = data.cuponera;

    document.getElementById('cup-usos-titulo').textContent = `🎟️ ${c.cliente_nombre}`;
    document.getElementById('cup-usos-resumen').innerHTML =
      `Usó <strong>${c.usadas}</strong> de <strong>${c.total_sesiones}</strong> sesiones` +
      (c.servicio_nombre ? ` · ${escaparHTML(c.servicio_nombre)}` : '');

    if (!data.usos.length) {
      lista.innerHTML = '<p class="cuponera-vacio">Todavía no usó ninguna sesión.</p>';
      return;
    }

    lista.innerHTML = data.usos.map((u, i) => `
      <div class="cuponera-uso">
        <div>
          <strong>Sesión ${data.usos.length - i}</strong>
          <small>${formatearFecha(u.fecha.toString().split('T')[0])}</small>
          ${u.nota ? `<small>${escaparHTML(u.nota)}</small>` : ''}
        </div>
        <button class="btn-cup-deshacer" data-uso="${u.id}" title="Deshacer esta sesión">↩️</button>
      </div>`).join('');

    lista.querySelectorAll('[data-uso]').forEach(b =>
      b.addEventListener('click', () => deshacerUso(id, b.dataset.uso)));

  } catch (err) {
    lista.innerHTML = '';
    mostrarErrorForm('cup-usos-error', detalleError(err, 'No se pudo cargar el historial'));
  }
}

async function deshacerUso(cuponeraId, usoId) {
  if (!confirm('¿Deshacer esta sesión? Le vuelve a quedar disponible.')) return;
  try {
    const data = await CuponerasAPI.deshacerUso(cuponeraId, usoId);
    if (!data?.ok) { mostrarToast(data?.error || 'Error', 'error'); return; }
    mostrarToast('Sesión deshecha', 'exito');
    await verUsosCuponera(cuponeraId);
    await cargarYRenderizarCuponeras();
  } catch (err) {
    mostrarErrorForm('cup-usos-error', detalleError(err, 'No se pudo deshacer'));
  }
}

async function cerrarCuponera(id) {
  const c = cuponeras.find(x => String(x.id) === String(id));
  if (!c) return;
  if (!confirm(`¿Cerrar la cuponera de ${c.cliente_nombre}?\n\nLe quedan ${c.restantes} sesiones sin usar.`)) return;

  try {
    const data = await CuponerasAPI.cerrar(id);
    if (!data?.ok) { mostrarToast(data?.error || 'Error', 'error'); return; }
    mostrarToast('Cuponera cerrada', 'exito');
    await cargarYRenderizarCuponeras();
  } catch (err) {
    mostrarToast(detalleError(err, 'No se pudo cerrar'), 'error');
  }
}

async function abrirFormCuponera() {
  const modal = document.getElementById('modal-cuponera');
  document.getElementById('form-cuponera')?.reset();
  document.getElementById('form-cuponera-error')?.classList.add('oculto');
  document.getElementById('cup-precio-sesion').textContent = '';

  // Sesiones: 1 a 12, con 5 y 10 que son las que más se venden
  const selSesiones = document.getElementById('cup-sesiones');
  if (selSesiones) {
    selSesiones.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} sesion${n === 1 ? '' : 'es'}${n === 5 || n === 10 ? ' ⭐' : ''}</option>`)
      .join('');
  }

  // Servicios, para poder elegir de cuál es la cuponera
  if (!servicios.length) {
    try { servicios = await ServiciosAPI.getAll(); } catch { servicios = []; }
  }
  const selServ = document.getElementById('cup-servicio');
  if (selServ) {
    selServ.innerHTML = '<option value="">— Sin servicio específico —</option>' +
      servicios.map(s => `<option value="${s.id}">${escaparHTML(s.nombre)}</option>`).join('');
  }

  // Clientas ya conocidas, para no tipear el nombre entero
  const datalist = document.getElementById('cuponera-clientas');
  if (datalist && clientes.length) {
    datalist.innerHTML = clientes
      .map(c => `<option value="${escaparHTML(c.nombre)}"></option>`).join('');
  }

  modal?.classList.remove('oculto');
  document.getElementById('cup-cliente-nombre')?.focus();
}

/** "6 sesiones a $1.000 cada una", para que el precio se entienda. */
function mostrarPrecioPorSesion() {
  const el = document.getElementById('cup-precio-sesion');
  if (!el) return;
  const total    = parseFloat(getVal('cup-precio')) || 0;
  const sesiones = parseInt(getVal('cup-sesiones')) || 0;
  el.textContent = (total > 0 && sesiones > 0)
    ? `${sesiones} sesiones a $${Math.round(total / sesiones).toLocaleString('es-UY')} cada una.`
    : '';
}

async function handleSubmitCuponera(e) {
  e.preventDefault();

  const nombre   = getVal('cup-cliente-nombre').trim();
  const telefono = getVal('cup-cliente-telefono').trim();
  const sesiones = parseInt(getVal('cup-sesiones'));

  if (!nombre || nombre.length < 2) {
    mostrarErrorForm('form-cuponera-error', 'Escribí el nombre de la clienta');
    return;
  }
  if (!telefono) {
    mostrarErrorForm('form-cuponera-error', 'Escribí el teléfono de la clienta');
    return;
  }
  if (!sesiones || sesiones < 1 || sesiones > 12) {
    mostrarErrorForm('form-cuponera-error', 'Elegí entre 1 y 12 sesiones');
    return;
  }

  const servicioId = getVal('cup-servicio');
  const servicio   = servicios.find(s => String(s.id) === String(servicioId));

  setBtnLoading('btn-guardar-cuponera', true);
  try {
    const data = await CuponerasAPI.crear({
      cliente_nombre:   nombre,
      cliente_telefono: telefono,
      servicio_id:      servicioId || null,
      servicio_nombre:  servicio?.nombre || null,
      total_sesiones:   sesiones,
      precio_total:     parseFloat(getVal('cup-precio')) || 0,
      medio_pago:       getVal('cup-medio') || 'efectivo',
      notas:            getVal('cup-notas') || null,
    });

    if (!data?.ok) { mostrarErrorForm('form-cuponera-error', data?.error || 'Error al crear'); return; }

    cerrarModales();
    mostrarToast('🎟️ Cuponera creada', 'exito');
    await cargarYRenderizarCuponeras();
  } catch (err) {
    mostrarErrorForm('form-cuponera-error', detalleError(err, 'Error al crear la cuponera'));
  } finally {
    setBtnLoading('btn-guardar-cuponera', false);
  }
}

function mostrarErrorForm(id, mensaje) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = mensaje;
  el.classList.remove('oculto');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Arma un mensaje legible a partir de un error de la API.
 * Las validaciones responden 422 con { error, errores: [{campo, mensaje}] };
 * sin esto el usuario solo vería "Datos inválidos" y no sabría qué corregir.
 */
function detalleError(err, respaldo) {
  const errores = err?.data?.errores;
  if (Array.isArray(errores) && errores.length) {
    return errores.map(e => e.mensaje).join('. ');
  }
  return err?.message || respaldo;
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
        <p class="wa-item-tel">📞 ${escaparHTML(formatearTelefonoDisplay(m.destinatario_telefono || ''))}</p>
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

function abrirModalNuevaSucursalOperadora() {
  const existente = document.getElementById('modal-nueva-sucursal-operadora');
  if (existente) {
    existente.classList.remove('oculto');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'modal-nueva-sucursal-operadora';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h2 class="modal-titulo">➕ Nueva ubicación</h2>
        <button class="btn-cerrar-modal" aria-label="Cerrar">✕</button>
      </div>
      <form id="form-nueva-sucursal-operadora" class="form-modal">
        <div id="form-sucursal-operadora-error" class="form-error oculto"></div>
        <div class="campo">
          <label for="sucursal-operadora-tipo">Tipo</label>
          <select id="sucursal-operadora-tipo" required>
            <option value="">— Elegí tipo —</option>
            <option value="profesional">👤 Profesional</option>
            <option value="sucursal">🏪 Sucursal</option>
          </select>
        </div>
        <div class="campo">
          <label for="sucursal-operadora-nombre">Nombre</label>
          <input id="sucursal-operadora-nombre" type="text" maxlength="100" required placeholder="Ej: Andy Lashes Apodaca">
          <small id="sucursal-nombre-hint" style="font-size:11px;color:var(--gris);margin-top:4px;display:block"></small>
        </div>
        <div class="campo">
          <label for="sucursal-operadora-max">Máx. turnos por hora</label>
          <input id="sucursal-operadora-max" type="number" min="1" max="20" value="1" required>
        </div>
        <button type="submit" class="btn-primario">Guardar</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.btn-cerrar-modal')?.addEventListener('click', () => modal.classList.add('oculto'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('oculto'); });

  // Cambiar placeholder según tipo
  const selectTipo = modal.querySelector('#sucursal-operadora-tipo');
  const inputNombre = modal.querySelector('#sucursal-operadora-nombre');
  const hint = modal.querySelector('#sucursal-nombre-hint');
  if (selectTipo && inputNombre && hint) {
    selectTipo.addEventListener('change', () => {
      if (selectTipo.value === 'profesional') {
        inputNombre.placeholder = 'Ej: Andy Lashes Apodaca';
        hint.textContent = 'Nombre de la profesional o profesional independiente';
      } else if (selectTipo.value === 'sucursal') {
        inputNombre.placeholder = 'Ej: Andy Lashes San Nicolás';
        hint.textContent = 'Nombre de la sucursal o local';
      } else {
        inputNombre.placeholder = '';
        hint.textContent = '';
      }
    });
  }

  modal.querySelector('#form-nueva-sucursal-operadora')?.addEventListener('submit', handleCrearSucursalOperadora);
}

async function handleCrearSucursalOperadora(e) {
  e.preventDefault();
  const tipo = getVal('sucursal-operadora-tipo').trim();
  const nombre = getVal('sucursal-operadora-nombre').trim();
  const maxTurnos = Number(getVal('sucursal-operadora-max') || 1);

  if (!tipo) {
    mostrarErrorForm('form-sucursal-operadora-error', 'Seleccioná un tipo');
    return;
  }

  if (!nombre) {
    mostrarErrorForm('form-sucursal-operadora-error', 'Ingresá un nombre');
    return;
  }

  if (!Number.isInteger(maxTurnos) || maxTurnos < 1 || maxTurnos > 20) {
    mostrarErrorForm('form-sucursal-operadora-error', 'Máx. turnos por hora inválido');
    return;
  }

  try {
    const data = await SucursalesAPI.crear({ nombre, tipo, max_turnos_hora: maxTurnos });
    if (!data?.ok) {
      mostrarErrorForm('form-sucursal-operadora-error', data?.error || 'No se pudo crear');
      return;
    }
    document.getElementById('modal-nueva-sucursal-operadora')?.classList.add('oculto');
    mostrarToast('Ubicación creada ✅', 'exito');
    await renderSucursalesOperadora();
  } catch (err) {
    mostrarErrorForm('form-sucursal-operadora-error', err.message || 'Error al crear');
  }
}

function normalizarHorariosSucursalUI(horarios) {
  if (!Array.isArray(horarios)) return [];
  return horarios
    .map(h => ({
      dia: Number(h?.dia),
      desde: String(h?.desde || '').slice(0, 5),
      hasta: String(h?.hasta || '').slice(0, 5),
    }))
    .filter(h =>
      Number.isInteger(h.dia) &&
      h.dia >= 0 && h.dia <= 6 &&
      /^\d{2}:\d{2}$/.test(h.desde) &&
      /^\d{2}:\d{2}$/.test(h.hasta) &&
      h.desde < h.hasta
    );
}

async function renderSucursalesOperadora() {
  const cont = document.getElementById('sucursales-operadora-wrap');
  if (!cont) return;

  cont.innerHTML = `<div class="empty-state"><p class="empty-sub">Cargando sucursales...</p></div>`;

  try {
    const sucursales = await SucursalesAPI.listar();

    if (!Array.isArray(sucursales) || sucursales.length === 0) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-icono">🏪</span>
          <p class="empty-titulo">Sin sucursales</p>
          <p class="empty-sub">Tocá + para crear tu primera sucursal.</p>
        </div>`;
      return;
    }

    cont.innerHTML = sucursales.map(s => {
      const tipoBadge = s.tipo === 'profesional'
        ? '<span class="sucursal-tipo-badge profesional">👤 Profesional</span>'
        : '<span class="sucursal-tipo-badge sucursal">🏪 Sucursal</span>';
      return `
        <div class="sucursal-card" data-id="${s.id}">
          <div class="sucursal-card-head">
            <h3>${escaparHTML(s.nombre || 'Sucursal')}</h3>
            ${tipoBadge}
            <button class="btn-primario btn-sucursal-guardar" data-id="${s.id}">💾 Guardar horarios</button>
          </div>
          <div class="horarios-grid">
          ${DIAS_SEMANA_SUC.map((dia, idx) => `
            <div class="horario-item">
              <label>${dia}</label>
              <div class="horario-rango">
                <input type="time" class="horario-desde" data-id="${s.id}" data-dia="${idx}">
                <span>a</span>
                <input type="time" class="horario-hasta" data-id="${s.id}" data-dia="${idx}">
              </div>
            </div>
          `).join('')}
          </div>
        </div>
      </div>
    `}).join('');

    for (const s of sucursales) {
      try {
        const detalle = await SucursalesAPI.obtenerHorarios(s.id);
        const horarios = normalizarHorariosSucursalUI(detalle?.sucursal?.horarios);
        horarios.forEach(h => {
          const d = document.querySelector(`.horario-desde[data-id="${s.id}"][data-dia="${h.dia}"]`);
          const hst = document.querySelector(`.horario-hasta[data-id="${s.id}"][data-dia="${h.dia}"]`);
          if (d) d.value = h.desde;
          if (hst) hst.value = h.hasta;
        });
      } catch {}
    }

    cont.querySelectorAll('.btn-sucursal-guardar').forEach(btn => {
      btn.addEventListener('click', () => guardarHorariosSucursalOperadora(btn.dataset.id));
    });

  } catch (err) {
    cont.innerHTML = `<div class="empty-state"><p class="empty-sub">Error al cargar sucursales.</p></div>`;
  }
}

async function guardarHorariosSucursalOperadora(sucursalId) {
  const desdes = [...document.querySelectorAll(`.horario-desde[data-id="${sucursalId}"]`)];
  const horarios = [];

  for (const inputDesde of desdes) {
    const dia = Number(inputDesde.dataset.dia);
    const desde = inputDesde.value;
    const hasta = document.querySelector(`.horario-hasta[data-id="${sucursalId}"][data-dia="${dia}"]`)?.value || '';

    if (!desde && !hasta) continue;
    if (!desde || !hasta) {
      mostrarToast('Completá desde/hasta en ambos campos', 'error');
      return;
    }
    if (desde >= hasta) {
      mostrarToast(`Rango inválido en ${DIAS_SEMANA_SUC[dia]}`, 'error');
      return;
    }

    horarios.push({ dia, desde, hasta, activo: true });
  }

  try {
    const data = await SucursalesAPI.guardarHorarios(sucursalId, horarios);
    if (!data?.ok) {
      mostrarToast(data?.error || 'No se pudo guardar horarios', 'error');
      return;
    }
    mostrarToast('Horarios guardados ✅', 'exito');
  } catch (err) {
    mostrarToast(err.message || 'Error al guardar horarios', 'error');
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

// ═══════════════════════════════════════════════════════════
//  CLIENTES
// ═══════════════════════════════════════════════════════════

async function renderResumenFinanciero() {
  const contenedor = document.getElementById('resumen-financiero');
  if (!contenedor) return;

  contenedor.innerHTML = `<div class="pub-cargando">Cargando resumen...</div>`;

  try {
    const r = await ClientesAPI.resumen();
    if (!r) { contenedor.innerHTML = ''; return; }

    const semanaGan  = parseFloat(r.semana_ganancia) || 0;
    const semanaAnt  = parseFloat(r.semana_ant_ganancia) || 0;
    const mesGan     = parseFloat(r.mes_ganancia) || 0;
    const mesAnt     = parseFloat(r.mes_ant_ganancia) || 0;
    const semanaTurnos = parseInt(r.semana_turnos) || 0;
    const mesTurnos    = parseInt(r.mes_turnos) || 0;

    const diffSemana = semanaAnt > 0 ? Math.round(((semanaGan - semanaAnt) / semanaAnt) * 100) : null;
    const diffMes    = mesAnt > 0 ? Math.round(((mesGan - mesAnt) / mesAnt) * 100) : null;

    const topServ = Array.isArray(r.top_servicios) ? r.top_servicios : [];
    const clientaMes = Array.isArray(r.clienta_mes) && r.clienta_mes.length ? r.clienta_mes[0] : null;

    const fmt = (n) => '$' + n.toLocaleString('es-UY');

    const badge = (diff) => {
      if (diff === null) return '';
      if (diff > 0) return `<span class="resumen-badge positivo">+${diff}%</span>`;
      if (diff < 0) return `<span class="resumen-badge negativo">${diff}%</span>`;
      return `<span class="resumen-badge neutro">0%</span>`;
    };

    contenedor.innerHTML = `
      <div class="resumen-grid">
        <div class="resumen-card">
          <p class="resumen-label">Esta semana</p>
          <p class="resumen-valor">${fmt(semanaGan)}</p>
          <p class="resumen-sub">${semanaTurnos} turno${semanaTurnos !== 1 ? 's' : ''}</p>
          ${badge(diffSemana)}
        </div>
        <div class="resumen-card">
          <p class="resumen-label">Este mes</p>
          <p class="resumen-valor">${fmt(mesGan)}</p>
          <p class="resumen-sub">${mesTurnos} turno${mesTurnos !== 1 ? 's' : ''}</p>
          ${badge(diffMes)}
        </div>
      </div>
      ${topServ.length ? `
        <div class="resumen-seccion">
          <p class="resumen-seccion-titulo">🔝 Top servicios del mes</p>
          ${topServ.map((s, i) => `
            <div class="resumen-fila">
              <span class="resumen-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
              <span class="resumen-fila-nombre">${escaparHTML(s.nombre)}</span>
              <span class="resumen-fila-valor">${parseInt(s.cantidad)} · ${fmt(parseFloat(s.total))}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${clientaMes ? `
        <div class="resumen-seccion">
          <p class="resumen-seccion-titulo">⭐ Clienta del mes</p>
          <div class="resumen-fila">
            <span class="resumen-rank">👑</span>
            <span class="resumen-fila-nombre">${escaparHTML(clientaMes.nombre)}</span>
            <span class="resumen-fila-valor">${parseInt(clientaMes.visitas)} visita${parseInt(clientaMes.visitas) !== 1 ? 's' : ''}</span>
          </div>
        </div>
      ` : ''}
    `;
  } catch {
    contenedor.innerHTML = '';
  }
}

async function renderClientes() {
  const contenedor = document.getElementById('lista-clientes');
  if (!contenedor) return;

  // Toggle del resumen
  const btnToggle = document.getElementById('btn-toggle-resumen');
  const resumenDiv = document.getElementById('resumen-financiero');
  btnToggle.onclick = () => {
    const abierto = !resumenDiv.classList.contains('oculto');
    resumenDiv.classList.toggle('oculto', abierto);
    btnToggle.querySelector('.btn-toggle-flecha').style.transform = abierto ? 'rotate(0deg)' : 'rotate(180deg)';
    if (!abierto && !resumenDiv.dataset.cargado) {
      renderResumenFinanciero();
      resumenDiv.dataset.cargado = 'true';
    }
  };

  // Botón agregar cliente
  const btnAgregar = document.getElementById('btn-agregar-cliente');
  if (btnAgregar) {
    btnAgregar.onclick = () => {
      document.getElementById('modal-nuevo-cliente').classList.remove('oculto');
      document.getElementById('input-nombre-cliente').value = '';
      document.getElementById('input-telefono-cliente').value = '';
      document.getElementById('input-nombre-cliente').focus();
    };
  }

  const form = document.getElementById('form-nuevo-cliente');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('input-nombre-cliente').value.trim();
      const telefonoRaw = document.getElementById('input-telefono-cliente').value.trim();
      if (!nombre || !telefonoRaw) return;
      try {
        await ClientesAPI.crearManual({ nombre, telefono: normalizarTelefono(telefonoRaw) });
        document.getElementById('modal-nuevo-cliente').classList.add('oculto');
        await cargarYRenderizarClientes();
      } catch (err) {
        alert('Error al crear cliente');
      }
    };
  }

  bindLimpiarInactivos();

  await cargarYRenderizarClientes();
}

// ═══════════════════════════════════════════════════════════
//  LIMPIAR CLIENTAS INACTIVAS
//  Borra la clienta Y TODOS sus turnos: los ingresos de esos
//  meses bajan y no hay vuelta atrás. Por eso siempre se
//  muestra primero qué se va a perder.
// ═══════════════════════════════════════════════════════════
let inactivosEncontrados = [];

function bindLimpiarInactivos() {
  const btnAbrir   = document.getElementById('btn-limpiar-inactivos');
  const modal      = document.getElementById('modal-limpiar-inactivos');
  const btnBuscar  = document.getElementById('btn-buscar-inactivos');
  const btnBorrar  = document.getElementById('btn-borrar-inactivos');
  const confirmo   = document.getElementById('inactivos-confirmo');
  if (!btnAbrir || !modal) return;

  btnAbrir.onclick = () => {
    inactivosEncontrados = [];
    document.getElementById('inactivos-resultado').innerHTML =
      '<p class="serv-fotos-vacio">Elegí un período y tocá Buscar.</p>';
    document.getElementById('inactivos-resumen').classList.add('oculto');
    document.getElementById('inactivos-error').classList.add('oculto');
    document.getElementById('inactivos-confirmo-wrap').classList.add('oculto');
    btnBorrar.classList.add('oculto');
    if (confirmo) confirmo.checked = false;
    modal.classList.remove('oculto');
  };

  if (btnBuscar) btnBuscar.onclick = buscarInactivos;
  if (confirmo)  confirmo.onchange = actualizarResumenInactivos;
  if (btnBorrar) btnBorrar.onclick = borrarInactivosSeleccionados;
}

async function buscarInactivos() {
  const meses = document.getElementById('inactivos-meses').value;
  const cont  = document.getElementById('inactivos-resultado');
  cont.innerHTML = '<div class="pub-cargando">Buscando...</div>';
  document.getElementById('inactivos-error').classList.add('oculto');

  try {
    const data = await ClientesAPI.inactivos(meses);
    inactivosEncontrados = data?.clientes || [];

    if (!inactivosEncontrados.length) {
      cont.innerHTML = '<p class="serv-fotos-vacio">No hay clientas inactivas en ese período. 🎉</p>';
      document.getElementById('inactivos-resumen').classList.add('oculto');
      document.getElementById('inactivos-confirmo-wrap').classList.add('oculto');
      document.getElementById('btn-borrar-inactivos').classList.add('oculto');
      return;
    }

    cont.innerHTML = inactivosEncontrados.map((c, i) => {
      const ultimo = c.ultimo_turno
        ? formatearFecha(c.ultimo_turno.toString().split('T')[0])
        : 'nunca vino';
      const gasto = (parseFloat(c.total_gastado) || 0).toLocaleString('es-UY');
      return `
        <label class="inactivo-item">
          <input type="checkbox" data-inactivo="${i}" ${c.favorito ? '' : 'checked'}>
          <span class="inactivo-datos">
            <strong>${escaparHTML(c.nombre || 'Sin nombre')}</strong>${c.favorito ? ' ⭐' : ''}
            <small>${escaparHTML(formatearTelefonoDisplay(c.telefono))} · último: ${ultimo}</small>
            <small>${c.total_turnos} turno(s) · $${gasto}</small>
          </span>
        </label>`;
    }).join('');

    cont.querySelectorAll('[data-inactivo]').forEach(chk => {
      chk.addEventListener('change', actualizarResumenInactivos);
    });

    document.getElementById('inactivos-confirmo-wrap').classList.remove('oculto');
    document.getElementById('btn-borrar-inactivos').classList.remove('oculto');
    actualizarResumenInactivos();

  } catch (err) {
    cont.innerHTML = '';
    mostrarErrorForm('inactivos-error', detalleError(err, 'No se pudo buscar'));
  }
}

/** Devuelve las clientas tildadas en la lista. */
function inactivosSeleccionados() {
  return Array.from(document.querySelectorAll('[data-inactivo]:checked'))
    .map(chk => inactivosEncontrados[Number(chk.dataset.inactivo)])
    .filter(Boolean);
}

function actualizarResumenInactivos() {
  const sel      = inactivosSeleccionados();
  const resumen  = document.getElementById('inactivos-resumen');
  const btn      = document.getElementById('btn-borrar-inactivos');
  const confirmo = document.getElementById('inactivos-confirmo');

  const turnos = sel.reduce((n, c) => n + Number(c.total_turnos || 0), 0);
  const plata  = sel.reduce((n, c) => n + (parseFloat(c.total_gastado) || 0), 0);

  resumen.innerHTML = sel.length
    ? `Vas a borrar <strong>${sel.length}</strong> clienta(s), <strong>${turnos}</strong> turno(s)
       y <strong>$${plata.toLocaleString('es-UY')}</strong> de historial de ingresos.`
    : 'No seleccionaste ninguna.';
  resumen.classList.remove('oculto');

  if (btn) btn.disabled = !sel.length || !confirmo?.checked;
}

async function borrarInactivosSeleccionados() {
  const sel = inactivosSeleccionados();
  if (!sel.length) return;

  const turnos = sel.reduce((n, c) => n + Number(c.total_turnos || 0), 0);
  if (!confirm(`Se van a borrar ${sel.length} clienta(s) y ${turnos} turno(s).\n\nEsto no se puede deshacer. ¿Seguimos?`)) return;

  const btn = document.getElementById('btn-borrar-inactivos');
  if (btn) { btn.disabled = true; btn.textContent = 'Borrando...'; }

  try {
    const data = await ClientesAPI.eliminar(sel.map(c => c.telefono));
    cerrarModales();
    mostrarToast(data?.mensaje || 'Clientas borradas', 'exito');
    await cargarYRenderizarClientes();
  } catch (err) {
    mostrarErrorForm('inactivos-error', detalleError(err, 'No se pudieron borrar'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Borrar seleccionadas'; }
  }
}

async function cargarYRenderizarClientes() {
  const contenedor = document.getElementById('lista-clientes');
  contenedor.innerHTML = `<div class="pub-cargando">Cargando clientes...</div>`;

  try {
    [clientes, clientesManuales] = await Promise.all([
      ClientesAPI.getAll(),
      ClientesAPI.getManuales(),
    ]);
  } catch (e) {
    contenedor.innerHTML = `<div class="pub-vacio">Error al cargar clientes</div>`;
    return;
  }

  const todos = [...clientes];
  const manualesTel = new Set(clientesManuales.map(c => c.telefono));

  // Merge: clientes manuales tienen prioridad (favorito flag)
  for (const cm of clientesManuales) {
    const idx = todos.findIndex(c => c.telefono === cm.telefono);
    if (idx >= 0) {
      todos[idx].favorito = cm.favorito;
      todos[idx].cliente_manual_id = cm.id;
    } else {
      todos.push({ ...cm, cliente_manual_id: cm.id, total_turnos: 0, total_gastado: 0, ultimo_turno: null });
    }
  }

  todos.sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (!todos.length) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <span class="empty-icono">👥</span>
        <p class="empty-titulo">Sin clientes todavía</p>
        <p class="empty-sub">Los clientes aparecen cuando agendás turnos</p>
      </div>`;
    return;
  }

  const buscar = document.getElementById('buscar-cliente');
  const renderLista = (filtro = '') => {
    const filtrados = filtro
      ? todos.filter(c =>
          c.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
          c.telefono.includes(filtro)
        )
      : todos;

    if (!filtrados.length) {
      contenedor.innerHTML = `<div class="pub-vacio">Sin resultados para "${filtro}"</div>`;
      return;
    }

    contenedor.innerHTML = filtrados.map(c => {
      const inicial = (c.nombre || '?')[0].toUpperCase();
      const gasto   = parseFloat(c.total_gastado) || 0;
      const fecha   = c.ultimo_turno ? formatearFecha(c.ultimo_turno.toString().split('T')[0]) : '—';
      const estrella = c.favorito ? '⭐' : '☆';
      return `
        <div class="cliente-card" data-tel="${escaparHTML(c.telefono)}">
          <div class="cliente-avatar">${inicial}</div>
          <div class="cliente-info">
            <p class="cliente-nombre">${escaparHTML(c.nombre)} <span class="cliente-favorito-btn" data-tel="${escaparHTML(c.telefono)}">${estrella}</span></p>
            <p class="cliente-tel">📞 ${escaparHTML(formatearTelefonoDisplay(c.telefono))}</p>
            <p class="cliente-ultimo">${fecha !== '—' ? 'Último: ' + fecha : ''}</p>
          </div>
          <div class="cliente-stats">
            <p class="cliente-gasto">$${gasto.toLocaleString('es-UY')}</p>
            <p class="cliente-turnos">${c.total_turnos} turno${c.total_turnos != 1 ? 's' : ''}</p>
          </div>
          <div class="cliente-acciones">
            <button class="btn-agendar-desde-card" data-tel="${escaparHTML(c.telefono)}" data-nombre="${escaparHTML(c.nombre)}">📅</button>
          </div>
        </div>`;
    }).join('');

    // Click en card → historial
    contenedor.querySelectorAll('.cliente-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.cliente-favorito-btn') || e.target.closest('.btn-agendar-desde-card')) return;
        abrirHistorialCliente(card.dataset.tel);
      });
    });

    // Toggle favorito
    contenedor.querySelectorAll('.cliente-favorito-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const tel = btn.dataset.tel;
        const cliente = todos.find(c => c.telefono === tel);
        if (!cliente) return;

        if (cliente.cliente_manual_id) {
          try {
            await ClientesAPI.toggleFavorito(cliente.cliente_manual_id);
            await cargarYRenderizarClientes();
          } catch (err) {
            alert('Error al actualizar favorito');
          }
        } else {
          // Crear como manual y marcar favorito
          try {
            const res = await ClientesAPI.crearManual({ nombre: cliente.nombre, telefono: cliente.telefono });
            await ClientesAPI.toggleFavorito(res.cliente.id);
            await cargarYRenderizarClientes();
          } catch (err) {
            alert('Error al marcar favorito');
          }
        }
      };
    });

    // Agendar desde card
    contenedor.querySelectorAll('.btn-agendar-desde-card').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        irATab('agenda');
        setTimeout(() => {
          const inputNombre = document.getElementById('input-nombre');
          const inputTelefono = document.getElementById('input-telefono');
          if (inputNombre) inputNombre.value = btn.dataset.nombre;
          if (inputTelefono) inputTelefono.value = formatearTelefonoDisplay(btn.dataset.tel);
        }, 100);
      };
    });
  };

  renderLista();

  if (buscar) {
    buscar.value = '';
    buscar.oninput = (e) => renderLista(e.target.value.trim());
  }
}

// ═══════════════════════════════════════════════════════════
//  PROFESIONALES
// ═══════════════════════════════════════════════════════════
function renderProfesionalesConfig() {
  const contenedor = document.getElementById('lista-profesionales-config');
  if (!contenedor) return;

  if (!profesionales.length) {
    contenedor.innerHTML = `<p style="font-size:13px;color:var(--gris);font-style:italic">Sin profesionales agregados todavía.</p>`;
    return;
  }

  contenedor.innerHTML = profesionales.map(p => `
    <div class="prof-config-card">
      <span class="prof-color-dot" style="background:${p.color}"></span>
      <div class="prof-config-info">
        <p class="prof-config-nombre">${escaparHTML(p.nombre)}</p>
        ${p.telefono ? `<p class="prof-config-tel">📞 ${escaparHTML(formatearTelefonoDisplay(p.telefono))}</p>` : ''}
      </div>
      <div class="prof-config-acciones">
        <button class="btn-icon btn-horarios-prof" data-id="${p.id}" data-nombre="${escaparHTML(p.nombre)}" title="Horarios">🕐</button>
        <button class="btn-icon btn-editar-prof" data-id="${p.id}" title="Editar">✏️</button>
        <button class="btn-icon btn-borrar-prof" data-id="${p.id}" title="Eliminar">🗑</button>
      </div>
    </div>
  `).join('');

  contenedor.querySelectorAll('.btn-horarios-prof').forEach(btn => {
    btn.addEventListener('click', () => abrirModalHorarios(btn.dataset.id, btn.dataset.nombre));
  });

  contenedor.querySelectorAll('.btn-editar-prof').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = profesionales.find(x => x.id === btn.dataset.id);
      if (p) abrirModalProfesional(p);
    });
  });

  contenedor.querySelectorAll('.btn-borrar-prof').forEach(btn => {
    btn.addEventListener('click', () => eliminarProfesional(btn.dataset.id));
  });
}

function renderFiltrosProfesional() {
  // Insertar filtros antes de lista-usuarios si hay profesionales
  let wrap = document.getElementById('filtro-profesional-wrap');
  const agenda = document.getElementById('lista-usuarios');
  if (!agenda) return;

  if (!profesionales.length) {
    if (wrap) wrap.remove();
    return;
  }

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'filtro-profesional-wrap';
    wrap.className = 'filtro-profesional-wrap';
    agenda.parentElement.insertBefore(wrap, agenda);
  }

  wrap.innerHTML = `
    <button class="filtro-prof-btn ${!filtroProfesionalId ? 'activo' : ''}" data-id="">
      Todas
    </button>
    ${profesionales.map(p => `
      <button class="filtro-prof-btn ${filtroProfesionalId === p.id ? 'activo' : ''}"
              data-id="${p.id}"
              style="${filtroProfesionalId === p.id ? `background:${p.color}20;border-color:${p.color};color:${p.color}` : ''}">
        ${escaparHTML(p.nombre)}
      </button>
    `).join('')}
  `;

  wrap.querySelectorAll('.filtro-prof-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroProfesionalId = btn.dataset.id || null;
      renderAgenda();
    });
  });
}

function abrirModalProfesional(prof = null) {
  editandoProfId = prof?.id || null;
  const modal  = document.getElementById('modal-profesional');
  const titulo = document.getElementById('modal-profesional-titulo');
  const err    = document.getElementById('form-profesional-error');

  titulo.textContent = prof ? '✏️ Editar profesional' : '➕ Nuevo profesional';
  err.classList.add('oculto');

  document.getElementById('prof-id').value     = prof?.id || '';
  document.getElementById('prof-nombre').value = prof?.nombre || '';
  document.getElementById('prof-color').value  = prof?.color || '#A85568';

  // Separar teléfono en código de país + número
  const telProf = String(prof?.telefono || '').replace(/\D/g, '');
  if (telProf.startsWith('598')) {
    document.getElementById('prof-codigo-pais').value = '598';
    document.getElementById('prof-telefono').value    = telProf.slice(3);
  } else if (telProf.startsWith('54')) {
    document.getElementById('prof-codigo-pais').value = '54';
    document.getElementById('prof-telefono').value    = telProf.slice(2);
  } else {
    document.getElementById('prof-codigo-pais').value = '598';
    document.getElementById('prof-telefono').value    = telProf;
  }

  modal.classList.remove('oculto');
}

async function handleSubmitProfesional(e) {
  e.preventDefault();
  const err    = document.getElementById('form-profesional-error');
  const nombre     = document.getElementById('prof-nombre').value.trim();
  const codigoProf = document.getElementById('prof-codigo-pais').value || '598';
  const telRaw     = document.getElementById('prof-telefono').value.trim().replace(/\D/g, '');
  const tel        = telRaw ? ('+' + codigoProf + telRaw) : '';
  const color      = document.getElementById('prof-color').value;

  if (!nombre) {
    err.textContent = 'El nombre es requerido';
    err.classList.remove('oculto');
    return;
  }

  setBtnLoading('btn-guardar-profesional', true);
  try {
    let data;
    if (editandoProfId) {
      data = await ProfesionalesAPI.actualizar(editandoProfId, { nombre, telefono: tel, color });
      if (data?.ok) {
        profesionales = profesionales.map(p => p.id === editandoProfId ? data.profesional : p);
        mostrarToast('Profesional actualizado ✅', 'exito');
      }
    } else {
      data = await ProfesionalesAPI.crear({ nombre, telefono: tel, color });
      if (data?.ok) {
        profesionales.push(data.profesional);
        mostrarToast('Profesional creado ✅', 'exito');
      }
    }
    if (!data?.ok) {
      err.textContent = data?.error || 'Error al guardar';
      err.classList.remove('oculto');
      return;
    }
    cerrarModales();
    renderProfesionalesConfig();
  } catch (e) {
    err.textContent = e.message || 'Error al guardar';
    err.classList.remove('oculto');
  } finally {
    setBtnLoading('btn-guardar-profesional', false);
  }
}

async function eliminarProfesional(id) {
  if (!confirm('¿Eliminar este profesional?')) return;
  try {
    await ProfesionalesAPI.eliminar(id);
    profesionales = profesionales.filter(p => p.id !== id);
    mostrarToast('Profesional eliminado', 'exito');
    renderProfesionalesConfig();
  } catch (e) {
    mostrarToast('Error al eliminar', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  MODAL HORARIOS PROFESIONAL
// ═══════════════════════════════════════════════════════════

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
let horariosProfActualId = null;
let bloqueosProfActual   = [];

async function abrirModalHorarios(profId, profNombre) {
  horariosProfActualId = profId;
  document.getElementById('modal-horarios-titulo').textContent = `🕐 Horarios — ${profNombre}`;
  document.getElementById('modal-horarios-prof').classList.remove('oculto');

  // Cargar horarios y bloqueos en paralelo
  const [horarios, bloqueos] = await Promise.all([
    ProfesionalesAPI.getHorarios(profId),
    ProfesionalesAPI.getBloqueos(profId),
  ]);

  renderDiasHorario(horarios);
  bloqueosProfActual = bloqueos;
  renderBloqueos();

  // Botón guardar horario semanal
  document.getElementById('btn-guardar-horarios').onclick = guardarHorarioSemanal;

  // Botón agregar bloqueo
  document.getElementById('btn-agregar-bloqueo').onclick = agregarBloqueo;
}

function renderDiasHorario(horarios) {
  const wrap = document.getElementById('horarios-dias-wrap');

  // Agrupar por día: { 0: [{hora_inicio, hora_fin}, ...], 1: [...], ... }
  const porDia = {};
  horarios.forEach(h => {
    if (!porDia[h.dia_semana]) porDia[h.dia_semana] = [];
    porDia[h.dia_semana].push(h);
  });

  wrap.innerHTML = DIAS_SEMANA.map((nombre, idx) => {
    const bloques = porDia[idx] || [];
    const activo  = bloques.length > 0;
    const bloquesHtml = bloques.length
      ? bloques.map((b, bi) => renderBloqueHorario(idx, bi, b.hora_inicio, b.hora_fin)).join('')
      : renderBloqueHorario(idx, 0, '09:00', '18:00');

    return `
      <div class="horario-dia-fila" data-dia="${idx}">
        <label class="horario-dia-label">
          <input type="checkbox" class="horario-check" data-dia="${idx}" ${activo ? 'checked' : ''}>
          <span>${nombre}</span>
        </label>
        <div class="horario-bloques-col ${activo ? '' : 'oculto'}" data-dia="${idx}">
          ${bloquesHtml}
          <button type="button" class="btn-agregar-bloque" data-dia="${idx}">+ turno cortado</button>
        </div>
      </div>
    `;
  }).join('');

  _bindHorarioEvents(wrap);
}

function renderBloqueHorario(dia, idx, inicio, fin) {
  return `
    <div class="horario-bloque-fila" data-dia="${dia}" data-idx="${idx}">
      <input type="time" class="horario-inicio" value="${String(inicio).slice(0,5)}">
      <span>a</span>
      <input type="time" class="horario-fin" value="${String(fin).slice(0,5)}">
      <button type="button" class="btn-icon btn-quitar-bloque" title="Quitar">✕</button>
    </div>
  `;
}

function _bindHorarioEvents(wrap) {
  // Mostrar/ocultar bloques al tildar el día
  wrap.querySelectorAll('.horario-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const col = wrap.querySelector(`.horario-bloques-col[data-dia="${chk.dataset.dia}"]`);
      col.classList.toggle('oculto', !chk.checked);
    });
  });

  // Agregar bloque extra (turno cortado)
  wrap.querySelectorAll('.btn-agregar-bloque').forEach(btn => {
    btn.addEventListener('click', () => {
      const dia = btn.dataset.dia;
      const col = wrap.querySelector(`.horario-bloques-col[data-dia="${dia}"]`);
      const nuevoBloque = document.createElement('div');
      nuevoBloque.innerHTML = renderBloqueHorario(dia, Date.now(), '09:00', '18:00');
      col.insertBefore(nuevoBloque.firstElementChild, btn);
      _bindQuitarBloque(col);
    });
  });

  wrap.querySelectorAll('.horario-bloques-col').forEach(col => _bindQuitarBloque(col));
}

function _bindQuitarBloque(col) {
  col.querySelectorAll('.btn-quitar-bloque').forEach(btn => {
    btn.onclick = () => {
      const fila = btn.closest('.horario-bloque-fila');
      const col2 = fila.parentElement;
      // Si es el único bloque, no lo borramos — simplemente desmarcamos el día
      const filas = col2.querySelectorAll('.horario-bloque-fila');
      if (filas.length === 1) {
        const dia = col2.dataset.dia;
        const chk = document.querySelector(`.horario-check[data-dia="${dia}"]`);
        if (chk) { chk.checked = false; col2.classList.add('oculto'); }
      } else {
        fila.remove();
      }
    };
  });
}

async function guardarHorarioSemanal() {
  const wrap   = document.getElementById('horarios-dias-wrap');
  const bloques = [];
  let errorEncontrado = false;

  wrap.querySelectorAll('.horario-check:checked').forEach(chk => {
    const dia = Number(chk.dataset.dia);
    const col = wrap.querySelector(`.horario-bloques-col[data-dia="${dia}"]`);
    col.querySelectorAll('.horario-bloque-fila').forEach(fila => {
      const inicio = fila.querySelector('.horario-inicio').value;
      const fin    = fila.querySelector('.horario-fin').value;
      if (!inicio || !fin || inicio >= fin) {
        mostrarToast(`${DIAS_SEMANA[dia]}: hora inicio debe ser menor que hora fin`, 'error');
        errorEncontrado = true;
        return;
      }
      bloques.push({ dia_semana: dia, hora_inicio: inicio, hora_fin: fin });
    });
  });

  if (errorEncontrado) return;

  const btn = document.getElementById('btn-guardar-horarios');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const res = await ProfesionalesAPI.guardarHorarios(horariosProfActualId, bloques);
    if (res?.ok) mostrarToast('Horario guardado ✅', 'exito');
    else mostrarToast(res?.error || 'Error al guardar', 'error');
  } catch {
    mostrarToast('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar horario semanal';
  }
}

function renderBloqueos() {
  const lista = document.getElementById('bloqueos-lista');
  if (!bloqueosProfActual.length) {
    lista.innerHTML = `<li class="bloqueo-item" style="font-style:italic;color:var(--gris)">Sin días bloqueados.</li>`;
    return;
  }
  lista.innerHTML = bloqueosProfActual.map(b => `
    <li class="bloqueo-item">
      <span>📅 ${b.fecha.slice(0, 10)}${b.motivo ? ` — ${escaparHTML(b.motivo)}` : ''}</span>
      <button class="btn-icon btn-quitar-bloqueo" data-id="${b.id}" title="Quitar">✕</button>
    </li>
  `).join('');

  lista.querySelectorAll('.btn-quitar-bloqueo').forEach(btn => {
    btn.addEventListener('click', () => quitarBloqueo(btn.dataset.id));
  });
}

async function agregarBloqueo() {
  const fecha  = document.getElementById('bloqueo-fecha').value;
  const motivo = document.getElementById('bloqueo-motivo').value.trim();
  if (!fecha) { mostrarToast('Seleccioná una fecha', 'error'); return; }

  try {
    const res = await ProfesionalesAPI.agregarBloqueo(horariosProfActualId, fecha, motivo);
    if (res?.ok) {
      bloqueosProfActual.push(res.bloqueo);
      bloqueosProfActual.sort((a, b) => a.fecha.localeCompare(b.fecha));
      renderBloqueos();
      document.getElementById('bloqueo-fecha').value  = '';
      document.getElementById('bloqueo-motivo').value = '';
      mostrarToast('Día bloqueado ✅', 'exito');
    } else {
      mostrarToast(res?.error || 'Error', 'error');
    }
  } catch {
    mostrarToast('Error al bloquear día', 'error');
  }
}

async function quitarBloqueo(bloqueoId) {
  try {
    await ProfesionalesAPI.eliminarBloqueo(horariosProfActualId, bloqueoId);
    bloqueosProfActual = bloqueosProfActual.filter(b => b.id !== bloqueoId);
    renderBloqueos();
    mostrarToast('Bloqueo eliminado', 'exito');
  } catch {
    mostrarToast('Error al eliminar bloqueo', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  CAJA — ingresos, gastos y cobros
// ═══════════════════════════════════════════════════════════
const MEDIOS_LABEL = {
  efectivo:      '💵 Efectivo',
  transferencia: '🏦 Transferencia',
  tarjeta:       '💳 Débito/crédito',
  billetera:     '📱 Billetera',
  cuponera:      '🎟️ Cuponera',
};

const CAT_INGRESO = ['Turno', 'Seña', 'Cuponera', 'Producto', 'Otro'];
const CAT_GASTO   = ['Insumos', 'Alquiler de jornada', 'Transporte',
                     'Publicidad', 'Materiales', 'Sueldos', 'Otro'];

let cajaMes      = new Date();   // mes que se está mirando
let cajaBindeado = false;
let cobroTurnoId = null;

function plata(n) {
  const v = Math.round(parseFloat(n) || 0);
  return '$ ' + v.toLocaleString('es-UY');
}

// Primer y último día del mes que se está mirando, en YYYY-MM-DD.
// Se arma a mano y no con toISOString(), que pasa a UTC y en Uruguay
// atrasa un día: el 1 de marzo terminaría mostrando febrero.
function rangoCajaMes() {
  const a = cajaMes.getFullYear();
  const m = cajaMes.getMonth();
  const dd = (n) => String(n).padStart(2, '0');
  const ultimo = new Date(a, m + 1, 0).getDate();
  return {
    desde: a + '-' + dd(m + 1) + '-01',
    hasta: a + '-' + dd(m + 1) + '-' + dd(ultimo),
  };
}

function bindCaja() {
  if (cajaBindeado) return;

  document.getElementById('caja-mes-ant')?.addEventListener('click', () => {
    cajaMes = new Date(cajaMes.getFullYear(), cajaMes.getMonth() - 1, 1);
    renderCaja();
  });
  document.getElementById('caja-mes-sig')?.addEventListener('click', () => {
    cajaMes = new Date(cajaMes.getFullYear(), cajaMes.getMonth() + 1, 1);
    renderCaja();
  });

  document.getElementById('btn-caja-ingreso')?.addEventListener('click', () => abrirModalMovimiento('ingreso'));
  document.getElementById('btn-caja-gasto')?.addEventListener('click',   () => abrirModalMovimiento('gasto'));

  document.getElementById('form-movimiento')?.addEventListener('submit', guardarMovimiento);
  document.getElementById('form-cobro')?.addEventListener('submit', guardarCobro);

  document.getElementById('btn-caja-socios')?.addEventListener('click', abrirModalSocios);
  document.getElementById('form-socios')?.addEventListener('submit', guardarSocios);
  document.getElementById('btn-agregar-socio')?.addEventListener('click', () => {
    socios.push({ nombre: '', porcentaje: 0 });
    pintarFilasSocios();
  });

  document.querySelectorAll('#modal-movimiento .btn-cerrar-modal, #modal-cobro .btn-cerrar-modal, #modal-socios .btn-cerrar-modal')
    .forEach(b => b.addEventListener('click', cerrarModales));

  cajaBindeado = true;
}

async function renderCaja() {
  bindCaja();

  const { desde, hasta } = rangoCajaMes();
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const lbl = document.getElementById('caja-mes-label');
  if (lbl) lbl.textContent = meses[cajaMes.getMonth()] + ' ' + cajaMes.getFullYear();

  const lista = document.getElementById('caja-movimientos');
  if (lista) lista.innerHTML = '<div class="pub-cargando">Cargando...</div>';

  try {
    const [res, movs] = await Promise.all([
      CajaAPI.resumen(desde, hasta),
      CajaAPI.movimientos(desde, hasta),
    ]);

    document.getElementById('caja-ingresos').textContent = plata(res.ingresos);
    document.getElementById('caja-gastos').textContent   = plata(res.gastos);

    const gan = document.getElementById('caja-ganancia');
    gan.textContent = plata(res.ganancia);
    gan.classList.toggle('en-rojo', res.ganancia < 0);

    const ant = document.getElementById('caja-saldo-anterior');
    ant.textContent = plata(res.saldoAnterior);
    ant.classList.toggle('en-rojo', res.saldoAnterior < 0);

    const enCaja = document.getElementById('caja-en-caja');
    enCaja.textContent = plata(res.enCaja);
    enCaja.classList.toggle('en-rojo', res.enCaja < 0);

    pintarDesgloseMedios(res.porMedio);
    pintarDesgloseCategorias(res.porCategoria);
    pintarReparto(res.reparto, res.ganancia);
    pintarMovimientos(movs.movimientos || []);

    // Las deudas no dependen del mes que se esté mirando: es lo que le
    // deben hoy, venga de donde venga. Va aparte para no atarlo al rango.
    renderDeudas();

    // La configuración del recordatorio va siempre, tenga deudas o no:
    // si sólo apareciera cuando ya le deben, no podría dejarlo listo antes.
    cargarAvisoCobro();

  } catch (err) {
    if (lista) lista.innerHTML = '<p class="caja-vacio">No se pudo cargar la caja: ' + escaparHTML(err.message) + '</p>';
  }
}

function pintarDesgloseMedios(filas) {
  const cont = document.getElementById('caja-por-medio');
  if (!cont) return;

  const conPlata = (filas || []).filter(f => parseFloat(f.ingresos) > 0);
  if (!conPlata.length) {
    cont.innerHTML = '<p class="caja-vacio">Todavía no entró nada este mes.</p>';
    return;
  }

  cont.innerHTML = conPlata.map(f =>
    '<div class="caja-desglose-fila">' +
      '<span>' + (MEDIOS_LABEL[f.medio_pago] || escaparHTML(f.medio_pago)) + '</span>' +
      '<b>' + plata(f.ingresos) + '</b>' +
    '</div>'
  ).join('');
}

function pintarDesgloseCategorias(filas) {
  const cont = document.getElementById('caja-por-categoria');
  if (!cont) return;

  const gastos = (filas || []).filter(f => f.tipo === 'gasto');
  if (!gastos.length) {
    cont.innerHTML = '<p class="caja-vacio">No cargaste gastos este mes.</p>';
    return;
  }

  cont.innerHTML = gastos.map(f =>
    '<div class="caja-desglose-fila">' +
      '<span>' + escaparHTML(f.categoria) + ' <small>(' + f.cantidad + ')</small></span>' +
      '<b class="en-rojo">' + plata(f.total) + '</b>' +
    '</div>'
  ).join('');
}

function pintarMovimientos(movs) {
  const cont = document.getElementById('caja-movimientos');
  if (!cont) return;

  if (!movs.length) {
    cont.innerHTML = '<p class="caja-vacio">Sin movimientos en este mes.</p>';
    return;
  }

  cont.innerHTML = movs.map(m => {
    const esIngreso = m.tipo === 'ingreso';
    const detalle   = m.cliente_nombre || m.concepto || m.categoria;
    const fechaCorta = (m.fecha || '').toString().slice(0, 10).split('-').reverse().join('/');
    return '' +
      '<div class="caja-mov ' + (esIngreso ? 'mov-in' : 'mov-out') + '">' +
        '<div class="caja-mov-info">' +
          '<p class="caja-mov-tit">' + escaparHTML(detalle) + '</p>' +
          '<p class="caja-mov-sub">' + escaparHTML(m.categoria) + ' · ' +
            (MEDIOS_LABEL[m.medio_pago] || '') + ' · ' + fechaCorta + '</p>' +
        '</div>' +
        '<div class="caja-mov-der">' +
          '<b class="' + (esIngreso ? 'en-verde' : 'en-rojo') + '">' +
            (esIngreso ? '+' : '−') + ' ' + plata(m.monto) + '</b>' +
          '<button class="btn-icon btn-borrar-mov" data-id="' + m.id + '" title="Borrar">🗑</button>' +
        '</div>' +
      '</div>';
  }).join('');

  cont.querySelectorAll('.btn-borrar-mov').forEach(b => {
    b.addEventListener('click', () => borrarMovimiento(b.dataset.id));
  });
}

async function borrarMovimiento(id) {
  if (!confirm('¿Borrar este movimiento? La plata deja de contar en el mes.')) return;
  try {
    await CajaAPI.borrar(id);
    mostrarToast('Movimiento borrado', 'exito');
    renderCaja();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo borrar', 'error');
  }
}

// ─── Alta manual de ingreso o gasto ───────────────────────
function abrirModalMovimiento(tipo) {
  const modal = document.getElementById('modal-movimiento');
  if (!modal) return;

  document.getElementById('modal-movimiento-titulo').textContent =
    tipo === 'ingreso' ? '➕ Nuevo ingreso' : '➖ Nuevo gasto';

  const sel  = document.getElementById('mov-categoria');
  const cats = tipo === 'ingreso' ? CAT_INGRESO : CAT_GASTO;
  sel.innerHTML = cats.map(c => '<option value="' + c + '">' + c + '</option>').join('');

  document.getElementById('form-movimiento').dataset.tipo = tipo;
  document.getElementById('mov-monto').value    = '';
  document.getElementById('mov-concepto').value = '';
  document.getElementById('mov-fecha').value    = hoy();
  document.getElementById('form-movimiento-error').classList.add('oculto');

  modal.classList.remove('oculto');
  document.getElementById('mov-monto').focus();
}

async function guardarMovimiento(e) {
  e.preventDefault();

  const form  = document.getElementById('form-movimiento');
  const error = document.getElementById('form-movimiento-error');
  const btn   = document.getElementById('btn-guardar-movimiento');
  const monto = parseFloat(document.getElementById('mov-monto').value);

  if (!monto || monto <= 0) {
    error.textContent = 'Poné un monto mayor a cero.';
    error.classList.remove('oculto');
    return;
  }

  btn.disabled = true;
  try {
    await CajaAPI.crear({
      tipo:       form.dataset.tipo,
      categoria:  document.getElementById('mov-categoria').value,
      concepto:   document.getElementById('mov-concepto').value.trim() || null,
      monto:      monto,
      medio_pago: document.getElementById('mov-medio').value,
      fecha:      document.getElementById('mov-fecha').value || null,
    });
    cerrarModales();
    mostrarToast('Movimiento registrado ✅', 'exito');
    renderCaja();
  } catch (err) {
    error.textContent = err.message || 'No se pudo guardar';
    error.classList.remove('oculto');
  } finally {
    btn.disabled = false;
  }
}

// ─── Cobrar un turno ──────────────────────────────────────
async function abrirModalCobro(turnoId) {
  const modal = document.getElementById('modal-cobro');
  if (!modal) return;

  cobroTurnoId = turnoId;
  const detalle = document.getElementById('cobro-detalle');
  const hint    = document.getElementById('cobro-hint');
  const input   = document.getElementById('cobro-monto');

  detalle.textContent = 'Cargando...';
  hint.textContent    = '';
  input.value         = '';
  document.getElementById('form-cobro-error').classList.add('oculto');
  modal.classList.remove('oculto');

  try {
    const s = await CajaAPI.sugerencia(turnoId);

    detalle.innerHTML = '<b>' + escaparHTML(s.cliente || '') + '</b>' +
      (s.servicio_nombre ? ' · ' + escaparHTML(s.servicio_nombre) : '');

    const medio = document.getElementById('cobro-medio');

    if (s.con_cuponera) {
      // Ya pagó el día que compró la cuponera: hoy no entra plata.
      input.value   = 0;
      medio.value   = 'cuponera';
      hint.innerHTML = '🎟️ Esta clienta tiene <b>cuponera con ' + s.cuponera_restantes +
        ' ' + (s.cuponera_restantes === 1 ? 'sesión' : 'sesiones') + '</b>. ' +
        'Ya pagó cuando la compró, así que va en $0 y se le descuenta una sesión. ' +
        'Si le cobrás algo aparte, escribilo.';
    } else {
      input.value = s.sugerido > 0 ? s.sugerido : '';
      medio.value = 'efectivo';

      if (s.senia_cobrada > 0) {
        hint.textContent = 'El servicio son ' + plata(s.precio) + ' y ya pagó ' +
          plata(s.senia_cobrada) + ' de seña. Falta ' + plata(s.sugerido) + '.';
      } else if (s.precio > 0) {
        hint.textContent = 'Precio del servicio: ' + plata(s.precio) + '. Podés cambiarlo.';
      } else {
        hint.textContent = 'Este servicio no tiene precio cargado. Escribí cuánto cobraste.';
      }
    }
    input.focus();

  } catch (err) {
    detalle.textContent = '';
    const box = document.getElementById('form-cobro-error');
    box.textContent = err.message || 'Error';
    box.classList.remove('oculto');
  }
}

async function guardarCobro(e) {
  e.preventDefault();
  if (!cobroTurnoId) return;

  const error = document.getElementById('form-cobro-error');
  const btn   = document.getElementById('btn-guardar-cobro');
  const medio = document.getElementById('cobro-medio').value;
  const bruto = document.getElementById('cobro-monto').value;
  const monto = parseFloat(bruto);

  // Con cuponera el cobro puede ser $0: la plata entró cuando la compró.
  if (bruto === '' || isNaN(monto) || monto < 0) {
    error.textContent = 'Poné cuánto cobraste (puede ser 0 si vino con cuponera).';
    error.classList.remove('oculto');
    return;
  }
  if (monto === 0 && medio !== 'cuponera') {
    error.textContent = 'Un cobro en $0 solo tiene sentido si pagó con cuponera.';
    error.classList.remove('oculto');
    return;
  }

  btn.disabled = true;
  try {
    await CajaAPI.cobrar(cobroTurnoId, { monto: monto, medio_pago: medio });
    cerrarModales();
    mostrarToast('Cobro registrado 💵', 'exito');
    cobroTurnoId = null;
    await cargarTurnos();
    renderTabActual();
  } catch (err) {
    error.textContent = err.message || 'No se pudo registrar el cobro';
    error.classList.remove('oculto');
  } finally {
    btn.disabled = false;
  }
}

// ─── Socios ───────────────────────────────────────────────
// Si la operadora no carga ninguno, todo este bloque queda invisible.
let socios = [];

function pintarReparto(reparto, ganancia) {
  const bloque = document.getElementById('caja-bloque-socios');
  const cont   = document.getElementById('caja-reparto');
  if (!bloque || !cont) return;

  if (!reparto || !reparto.length) {
    bloque.style.display = 'none';
    return;
  }
  bloque.style.display = '';

  if (ganancia <= 0) {
    cont.innerHTML = '<p class="caja-vacio">Este mes todavía no hay ganancia para repartir.</p>';
    return;
  }

  cont.innerHTML = reparto.map(s =>
    '<div class="caja-desglose-fila">' +
      '<span>' + escaparHTML(s.nombre) + ' <small>(' + s.porcentaje + '%)</small></span>' +
      '<b>' + plata(s.monto) + '</b>' +
    '</div>'
  ).join('');
}

async function abrirModalSocios() {
  const modal = document.getElementById('modal-socios');
  if (!modal) return;

  document.getElementById('form-socios-error').classList.add('oculto');
  modal.classList.remove('oculto');

  try {
    const r = await CajaAPI.socios();
    socios = (r.socios || []).map(s => ({ nombre: s.nombre, porcentaje: s.porcentaje }));
  } catch {
    socios = [];
  }
  pintarFilasSocios();
}

function pintarFilasSocios() {
  const cont = document.getElementById('socios-lista');
  if (!cont) return;

  if (!socios.length) {
    cont.innerHTML = '<p class="caja-vacio">Sin socios. Trabajás sola.</p>';
  } else {
    cont.innerHTML = socios.map((s, i) =>
      '<div class="socio-fila">' +
        '<input type="text" class="socio-nombre" data-i="' + i + '" maxlength="100" ' +
               'placeholder="Nombre" value="' + escaparHTML(s.nombre) + '">' +
        '<input type="number" class="socio-pct" data-i="' + i + '" min="1" max="100" ' +
               'step="0.01" placeholder="%" value="' + s.porcentaje + '">' +
        '<button type="button" class="socio-quitar" data-i="' + i + '">🗑</button>' +
      '</div>'
    ).join('');

    cont.querySelectorAll('.socio-nombre').forEach(inp => {
      inp.addEventListener('input', () => { socios[inp.dataset.i].nombre = inp.value; });
    });
    cont.querySelectorAll('.socio-pct').forEach(inp => {
      inp.addEventListener('input', () => {
        socios[inp.dataset.i].porcentaje = parseFloat(inp.value) || 0;
        pintarSumaSocios();
      });
    });
    cont.querySelectorAll('.socio-quitar').forEach(btn => {
      btn.addEventListener('click', () => {
        socios.splice(parseInt(btn.dataset.i), 1);
        pintarFilasSocios();
      });
    });
  }
  pintarSumaSocios();
}

function pintarSumaSocios() {
  const el = document.getElementById('socios-suma');
  if (!el) return;

  if (!socios.length) { el.textContent = ''; el.className = 'socios-suma'; return; }

  const suma = socios.reduce((a, s) => a + (parseFloat(s.porcentaje) || 0), 0);
  const ok   = Math.abs(suma - 100) <= 0.01;
  el.textContent = 'Suman ' + suma.toFixed(2) + '%' + (ok ? ' ✅' : ' — tienen que sumar 100');
  el.className = 'socios-suma ' + (ok ? 'en-verde' : 'en-rojo');
}

async function guardarSocios(e) {
  e.preventDefault();

  const error = document.getElementById('form-socios-error');
  const btn   = document.getElementById('btn-guardar-socios');

  const limpios = socios
    .filter(s => (s.nombre || '').trim() && parseFloat(s.porcentaje) > 0)
    .map(s => ({ nombre: s.nombre.trim(), porcentaje: parseFloat(s.porcentaje) }));

  if (limpios.length) {
    const suma = limpios.reduce((a, s) => a + s.porcentaje, 0);
    if (Math.abs(suma - 100) > 0.01) {
      error.textContent = 'Los porcentajes tienen que sumar 100. Ahora suman ' + suma.toFixed(2) + '.';
      error.classList.remove('oculto');
      return;
    }
  }

  btn.disabled = true;
  try {
    const r = await CajaAPI.guardarSocios(limpios);
    cerrarModales();
    mostrarToast(r.mensaje || 'Socios guardados', 'exito');
    renderCaja();
  } catch (err) {
    error.textContent = err.message || 'No se pudo guardar';
    error.classList.remove('oculto');
  } finally {
    btn.disabled = false;
  }
}

// ─── Te deben ─────────────────────────────────────────────
// Un turno que ya pasó, sin cancelar y sin cobro registrado, es una
// deuda. No hay tabla de deudas: la deuda es la ausencia del cobro.
async function renderDeudas() {
  const bloque = document.getElementById('caja-bloque-deudas');
  const cont   = document.getElementById('caja-deudas');
  const resumen = document.getElementById('caja-deudas-resumen');
  if (!bloque || !cont) return;

  try {
    const r = await CajaAPI.deudas();
    const lista = r.deudas || [];

    if (!lista.length) {
      bloque.style.display = 'none';
      return;
    }
    bloque.style.display = '';

    const cuantas = r.clientas === 1 ? '1 clienta' : r.clientas + ' clientas';
    resumen.textContent = plata(r.total) + ' · ' + cuantas;

    cont.innerHTML = lista.map(d => {
      const f = (d.fecha || '').toString().slice(0, 10).split('-').reverse().join('/');
      const detalle = [d.servicio_nombre, d.servicio_zona].filter(Boolean).join(' · ');
      const monto = d.precio > 0
        ? plata(d.debe)
        : '<small>sin precio</small>';
      const nota = d.senia_cobrada > 0
        ? ' · ya pagó ' + plata(d.senia_cobrada) + ' de seña'
        : '';

      return '' +
        '<div class="caja-mov deuda">' +
          '<div class="caja-mov-info">' +
            '<p class="caja-mov-tit">' + escaparHTML(d.cliente || '') + '</p>' +
            '<p class="caja-mov-sub">' + escaparHTML(detalle || 'Turno') + ' · ' + f + nota + '</p>' +
          '</div>' +
          '<div class="caja-mov-der">' +
            '<b class="en-rojo">' + monto + '</b>' +
            '<button class="btn-icon btn-deuda-wa" data-id="' + d.turno_id + '" title="Recordarle por WhatsApp">💬</button>' +
            '<button class="btn-deuda-cobrar" data-id="' + d.turno_id + '">Cobrar</button>' +
          '</div>' +
        '</div>';
    }).join('');

    cont.querySelectorAll('.btn-deuda-cobrar').forEach(b => {
      b.addEventListener('click', () => abrirModalCobro(b.dataset.id));
    });
    cont.querySelectorAll('.btn-deuda-wa').forEach(b => {
      const d = lista.find(x => String(x.turno_id) === String(b.dataset.id));
      b.addEventListener('click', () => recordarDeuda(d));
    });

  } catch (err) {
    bloque.style.display = '';
    cont.innerHTML = '<p class="caja-vacio">No se pudieron cargar: ' + escaparHTML(err.message) + '</p>';
  }
}

// Abre WhatsApp con el mensaje escrito. No lo manda solo a propósito:
// un cobro mal mandado le cuesta una clienta, así que lo lee antes.
function recordarDeuda(d) {
  if (!d) return;
  if (!d.telefono) { mostrarToast('Esa clienta no tiene teléfono cargado', 'error'); return; }

  const f = (d.fecha || '').toString().slice(0, 10).split('-').reverse().join('/');
  const nombre = (d.cliente || '').split(' ')[0];

  let msg = 'Hola ' + nombre + '! 🌸 ¿Cómo estás?\n\n';
  msg += 'Te escribo por el turno del ' + f;
  if (d.servicio_nombre) msg += ' (' + d.servicio_nombre + ')';
  msg += '. ';
  if (d.precio > 0) {
    msg += d.senia_cobrada > 0
      ? 'Quedó pendiente el saldo de $' + Math.round(d.debe) + '.'
      : 'Quedó pendiente el pago de $' + Math.round(d.debe) + '.';
  } else {
    msg += 'Quedó pendiente el pago.';
  }
  msg += '\n\nCuando puedas me avisás 💕';

  mostrarPreviewWA(d.telefono, msg);
}

// ─── Recordatorio automático de pago ──────────────────────
// Se guarda aparte del resto de la caja porque toca al usuario, no a
// los movimientos: es una preferencia, no un dato del mes.
let avisoCobroBindeado = false;

async function cargarAvisoCobro() {
  const check = document.getElementById('aviso-cobro-activo');
  if (!check) return;

  if (!avisoCobroBindeado) {
    check.addEventListener('change', () => {
      document.getElementById('aviso-cobro-opciones')
        .classList.toggle('oculto', !check.checked);
    });
    document.getElementById('btn-aviso-cobro')
      ?.addEventListener('click', guardarAvisoCobro);
    avisoCobroBindeado = true;
  }

  try {
    const r = await CajaAPI.avisos();
    check.checked = !!r.activo;
    document.getElementById('aviso-cobro-dias').value    = r.dias ?? 3;
    document.getElementById('aviso-cobro-repetir').value = r.repetir ?? 0;
    document.getElementById('aviso-cobro-opciones')
      .classList.toggle('oculto', !r.activo);
  } catch (_) {
    // Si no se puede leer la config, se deja el bloque como está: no
    // vale la pena romper la caja entera por esto.
  }
}

async function guardarAvisoCobro() {
  const btn = document.getElementById('btn-aviso-cobro');
  const activo  = document.getElementById('aviso-cobro-activo').checked;
  const dias    = parseInt(document.getElementById('aviso-cobro-dias').value);
  const repetir = parseInt(document.getElementById('aviso-cobro-repetir').value);

  if (activo && (!dias || dias < 1 || dias > 30)) {
    mostrarToast('Los días tienen que ir entre 1 y 30', 'error');
    return;
  }

  btn.disabled = true;
  try {
    const r = await CajaAPI.guardarAvisos({
      activo:  activo,
      dias:    dias || 3,
      repetir: isNaN(repetir) ? 0 : repetir,
    });
    mostrarToast(r.mensaje || 'Guardado ✅', 'exito');
  } catch (err) {
    mostrarToast(err.message || 'No se pudo guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}
