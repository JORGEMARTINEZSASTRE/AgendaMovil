'use strict';

let usuarios   = [];

function formatearTelefono(numero, codigoPais) {
  let limpio = (numero || '').replace(/\D/g, '');

  if (limpio.startsWith('0')) {
    limpio = limpio.slice(1);
  }

  if (!limpio) return null;

  return `+${codigoPais}${limpio}`;
}

function parseTelefono(full) {
  if (!full) return { codigo: '598', numero: '' };

  const limpio = full.replace('+', '');

  if (limpio.startsWith('598')) {
    return { codigo: '598', numero: limpio.slice(3) };
  }

  if (limpio.startsWith('54')) {
    return { codigo: '54', numero: limpio.slice(2) };
  }

  return { codigo: '598', numero: limpio };
}

let tokenAdmin = null;

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  tokenAdmin = localStorage.getItem('depimovil_token');

  if (!tokenAdmin) {
    window.location.href = '/login.html';
    return;
  }

  // Verificar que es admin
  try {
    const resp = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    });
    const data = await resp.json();

    if (!data.ok || data.usuario.rol !== 'admin') {
      window.location.href = '/index.html';
      return;
    }
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Ocultar splash
  document.getElementById('admin-splash').style.display = 'none';
  document.getElementById('admin-contenido').style.display = 'block';

  await cargarUsuarios();
  bindBotones();
  inicializarLinkRegistro();   // ← AGREGAR ESTA LÍNEA
});

// ═══════════════════════════════════════════════════════════
//  CARGAR USUARIOS
// ═══════════════════════════════════════════════════════════
async function cargarUsuarios() {
  try {
    const resp = await fetch(`${API_URL}/admin/usuarios`, {
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    });
    const data = await resp.json();
    if (!data.ok) return;

    // Filtrar solo clientas (no admins)
    usuarios = data.usuarios.filter(u => u.rol === 'cliente');
    renderStats();
    renderClientas();
  } catch (err) {
    console.error('[admin] cargarUsuarios:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════════
function renderStats() {
  const total   = usuarios.length;
  const activas = usuarios.filter(u => u.activo).length;
  const trial   = usuarios.filter(u => u.plan === 'trial').length;
  const premium = usuarios.filter(u => u.plan === 'premium').length;

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-activas').textContent = activas;
  document.getElementById('stat-trial').textContent   = trial;
  document.getElementById('stat-premium').textContent = premium;
}

// ═══════════════════════════════════════════════════════════
//  RENDER CLIENTAS
// ═══════════════════════════════════════════════════════════
function renderClientas() {
  const contenedor = document.getElementById('lista-clientas');
  if (!contenedor) return;

  if (usuarios.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <span class="empty-icono">👥</span>
        <p class="empty-titulo">Sin clientas</p>
        <p class="empty-sub">Creá tu primera clienta con el botón de arriba</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = usuarios.map(u => cardClientaHTML(u)).join('');
  bindAccionesClientas();
}

// ═══════════════════════════════════════════════════════════
//  CARD CLIENTA HTML
// ═══════════════════════════════════════════════════════════
function cardClientaHTML(u) {
  const trialInfo  = calcTrialInfo(u);
  const badgePlan  = u.plan === 'premium'
    ? `<span class="badge badge-premium">⭐ Premium</span>`
    : `<span class="badge badge-trial">🕐 Trial</span>`;
  const badgeEstado = u.activo
    ? `<span class="badge badge-activa">✅ Activa</span>`
    : `<span class="badge badge-inactiva">🔴 Inactiva</span>`;
  const badgeVencido = trialInfo.vencido
    ? `<span class="badge badge-vencido">⚠️ Trial vencido</span>`
    : '';

  const linkPublico = `${window.location.origin}/agenda-publica.html?u=${u.id}`;

  return `
    <div class="card-clienta ${u.activo ? '' : 'inactiva'}" data-id="${u.id}">
      <div class="clienta-header">
        <div class="clienta-info">
          <p class="clienta-nombre">${escaparHTML(u.nombre)}</p>
          ${u.nombre_negocio ? `<p class="clienta-negocio">🏪 ${escaparHTML(u.nombre_negocio)}</p>` : ''}
          <p class="clienta-email">📧 ${escaparHTML(u.email)}</p>
          ${u.telefono ? `<p class="clienta-email">📞 ${escaparHTML(u.telefono)}</p>` : ''}
        </div>
      </div>

      <div class="clienta-badges">
        ${badgePlan}
        ${badgeEstado}
        ${badgeVencido}
      </div>

      ${trialInfo.texto ? `<p class="clienta-trial-info">${trialInfo.texto}</p>` : ''}

      <div class="clienta-acciones">
        <button class="btn-admin btn-editar-clienta"
          data-id="${u.id}"
          data-nombre="${escaparHTML(u.nombre)}"
          data-negocio="${escaparHTML(u.nombre_negocio || '')}"
          data-telefono="${escaparHTML(u.telefono || '')}"
          data-email="${escaparHTML(u.email)}">
          ✏️ Editar
        </button>

        <button class="btn-admin btn-cambiar-plan" data-id="${u.id}" data-nombre="${escaparHTML(u.nombre)}" data-plan="${u.plan}">
          🔄 Cambiar plan
        </button>

        <button class="btn-admin btn-copiar-link btn-link" data-link="${linkPublico}">
          🔗 Copiar link
        </button>

        <button class="btn-admin btn-enviar-link" data-email="${escaparHTML(u.email)}" data-nombre="${escaparHTML(u.nombre)}" data-link="${linkPublico}">
          📧 Enviar link
        </button>

        ${u.activo
          ? `<button class="btn-admin btn-danger btn-toggle-activo" data-id="${u.id}" data-activo="true">
               🔴 Dar de baja
             </button>`
          : `<button class="btn-admin btn-success btn-toggle-activo" data-id="${u.id}" data-activo="false">
               ✅ Reactivar
             </button>`
        }

        <button class="btn-admin btn-danger btn-eliminar-clienta" data-id="${u.id}" data-nombre="${escaparHTML(u.nombre)}">
          🗑 Eliminar
        </button>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  CALC TRIAL INFO
// ═══════════════════════════════════════════════════════════
function calcTrialInfo(u) {
  if (u.plan !== 'trial' || !u.trial_fin) {
    return { texto: '', vencido: false, dias: null };
  }

  const fin  = new Date(u.trial_fin);
  const hoy  = new Date();
  const diff = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));

  if (diff < 0) {
    return {
      texto:   `⚠️ Trial vencido hace ${Math.abs(diff)} días`,
      vencido: true,
      dias:    diff
    };
  }

  return {
    texto:   `⏱ Trial vence en ${diff} día${diff !== 1 ? 's' : ''} (${fin.toLocaleDateString('es-AR')})`,
    vencido: false,
    dias:    diff
  };
}

// ═══════════════════════════════════════════════════════════
//  BIND ACCIONES CLIENTAS
// ═══════════════════════════════════════════════════════════
function bindAccionesClientas() {
  // Editar clienta
  document.querySelectorAll('.btn-editar-clienta').forEach(btn => {
    btn.addEventListener('click', () => {
      abrirModalEditarClienta(btn.dataset);
    });
  });

  // Cambiar plan
  document.querySelectorAll('.btn-cambiar-plan').forEach(btn => {
    btn.addEventListener('click', () => {
      abrirModalPlan(btn.dataset.id, btn.dataset.nombre, btn.dataset.plan);
    });
  });

  // Copiar link
  document.querySelectorAll('.btn-copiar-link').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.link).then(() => {
        mostrarToast('¡Link copiado! 📋');
      });
    });
  });

  // Toggle activo
  document.querySelectorAll('.btn-toggle-activo').forEach(btn => {
    btn.addEventListener('click', () => {
      const activo = btn.dataset.activo === 'true';
      toggleActivo(btn.dataset.id, activo);
    });
  });

  // Enviar link por mail
  document.querySelectorAll('.btn-enviar-link').forEach(btn => {
    btn.addEventListener('click', () => {
      enviarLinkPorMail(btn.dataset.email, btn.dataset.nombre, btn.dataset.link);
    });
  });

  // Eliminar
  document.querySelectorAll('.btn-eliminar-clienta').forEach(btn => {
    btn.addEventListener('click', () => {
      eliminarClienta(btn.dataset.id, btn.dataset.nombre);
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  BIND BOTONES GENERALES
// ═══════════════════════════════════════════════════════════
function bindBotones() {
  // Ir a la app
  document.getElementById('btn-ir-app')?.addEventListener('click', () => {
    window.location.href = '/index.html';
  });

  // Logout
  document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
    localStorage.removeItem('depimovil_token');
    localStorage.removeItem('depimovil_usuario');
    window.location.href = '/login.html';
  });

  // Nueva clienta
  document.getElementById('btn-nueva-clienta')?.addEventListener('click', () => {
    document.getElementById('modal-nueva-clienta').classList.remove('oculto');
  });

  // Cerrar modales
  document.querySelectorAll('.btn-cerrar-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => {
        m.classList.add('oculto');
      });
    });
  });

  // Click fuera del modal
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('oculto');
    });
  });

  // Form nueva clienta
  document.getElementById('form-nueva-clienta')?.addEventListener('submit', handleNuevaClienta);

  // Form editar clienta
  document.getElementById('form-editar-clienta')?.addEventListener('submit', handleEditarClienta);

  // Form editar plan
  document.getElementById('form-editar-plan')?.addEventListener('submit', handleEditarPlan);

  // Toggle días trial en nueva clienta
  document.getElementById('clienta-plan')?.addEventListener('change', function() {
    const campoDias = document.getElementById('campo-dias-trial');
    campoDias.style.display = this.value === 'trial' ? 'flex' : 'none';
  });

  // Toggle días trial en editar plan
  document.getElementById('edit-plan')?.addEventListener('change', function() {
    const campoDias = document.getElementById('campo-edit-dias');
    campoDias.style.display = this.value === 'trial' ? 'flex' : 'none';
  });
  document.addEventListener('DOMContentLoaded', async () => {
  tokenAdmin = localStorage.getItem('depimovil_token');

  if (!tokenAdmin) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const resp = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    });
    const data = await resp.json();

    if (!data.ok || data.usuario.rol !== 'admin') {
      window.location.href = '/index.html';
      return;
    }
  } catch {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('admin-splash').style.display = 'none';
  document.getElementById('admin-contenido').style.display = 'block';

  await cargarUsuarios();
  bindBotones();
  inicializarLinkRegistro();   // ← agregar esta línea
});
}

// ═══════════════════════════════════════════════════════════
//  NUEVA CLIENTA
// ═══════════════════════════════════════════════════════════
async function handleNuevaClienta(e) {
  e.preventDefault();

  const nombre   = document.getElementById('clienta-nombre').value.trim();
  const negocio  = document.getElementById('clienta-negocio').value.trim();
  const telefonoInput = document.getElementById('clienta-telefono').value.trim().replace(/\D/g,'');
  const codigoPais    = document.getElementById('clienta-codigo').value;
  const telefono      = telefonoInput ? `+${codigoPais}${telefonoInput}` : null;
  const email         = document.getElementById('clienta-email').value.trim();
  const password      = document.getElementById('clienta-password').value;
  const plan          = document.getElementById('clienta-plan').value;
  const dias          = parseInt(document.getElementById('clienta-dias').value) || 30;

  if (!nombre || !email || !password) {
    mostrarFormError('form-clienta-error', 'Completá todos los campos obligatorios');
    return;
  }
  if (password.length < 8) {
    mostrarFormError('form-clienta-error', 'La contraseña debe tener al menos 8 caracteres');
    return;
  }

  try {
    const resp = await fetch(`${API_URL}/admin/usuarios`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({
        nombre,
        nombre_negocio: negocio   || null,
        telefono:       telefono  || null,
        email,
        password,
        plan,
        dias_trial: dias,
      })
    });

    const data = await resp.json();

    if (!data.ok) {
      mostrarFormError('form-clienta-error', data.error || 'Error al crear la clienta');
      return;
    }

    document.getElementById('modal-nueva-clienta').classList.add('oculto');
    document.getElementById('form-nueva-clienta').reset();
    mostrarToast('✅ Clienta creada exitosamente');
    await cargarUsuarios();

  } catch (err) {
    mostrarFormError('form-clienta-error', 'Error de conexión');
  }
}

// ═══════════════════════════════════════════════════════════
//  ABRIR MODAL PLAN
// ═══════════════════════════════════════════════════════════
function abrirModalPlan(id, nombre, planActual) {
  document.getElementById('edit-plan-user-id').value = id;
  document.getElementById('edit-plan-nombre').textContent = nombre;
  document.getElementById('edit-plan').value = planActual;

  const campoDias = document.getElementById('campo-edit-dias');
  campoDias.style.display = planActual === 'trial' ? 'flex' : 'none';

  document.getElementById('modal-editar-plan').classList.remove('oculto');
}

// ═══════════════════════════════════════════════════════════
//  EDITAR PLAN
// ═══════════════════════════════════════════════════════════
async function handleEditarPlan(e) {
  e.preventDefault();

  const id   = document.getElementById('edit-plan-user-id').value;
  const plan = document.getElementById('edit-plan').value;
  const dias = parseInt(document.getElementById('edit-dias').value) || 30;

  try {
    const resp = await fetch(`${API_URL}/admin/usuarios/${id}/plan`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ plan, dias_trial: dias })
    });

    const data = await resp.json();

    if (!data.ok) {
      mostrarFormError('form-plan-error', data.error || 'Error al cambiar el plan');
      return;
    }

    document.getElementById('modal-editar-plan').classList.add('oculto');
    mostrarToast(`✅ Plan actualizado a ${plan}`);
    await cargarUsuarios();

  } catch {
    mostrarFormError('form-plan-error', 'Error de conexión');
  }
}

// ═══════════════════════════════════════════════════════════
//  TOGGLE ACTIVO
// ═══════════════════════════════════════════════════════════
async function toggleActivo(id, activoActual) {
  const accion = activoActual ? 'dar de baja' : 'reactivar';
  if (!confirm(`¿Querés ${accion} esta clienta?`)) return;

  try {
    const resp = await fetch(`${API_URL}/admin/usuarios/${id}/activo`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ activo: !activoActual })
    });

    const data = await resp.json();

    if (!data.ok) {
      mostrarToast(data.error || 'Error al actualizar', 'error');
      return;
    }

    mostrarToast(activoActual ? '🔴 Clienta dada de baja' : '✅ Clienta reactivada');
    await cargarUsuarios();

  } catch {
    mostrarToast('Error de conexión', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  ELIMINAR CLIENTA
// ═══════════════════════════════════════════════════════════
async function eliminarClienta(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer y se borrarán todos sus turnos.`)) return;

  try {
    const resp = await fetch(`${API_URL}/admin/usuarios/${id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${tokenAdmin}` }
    });

    const data = await resp.json();

    if (!data.ok) {
      mostrarToast(data.error || 'Error al eliminar', 'error');
      return;
    }

    mostrarToast('🗑 Clienta eliminada');
    await cargarUsuarios();

  } catch {
    mostrarToast('Error de conexión', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  EDITAR CLIENTA
// ═══════════════════════════════════════════════════════════
function abrirModalEditarClienta({ id, nombre, negocio, telefono, email }) {
  document.getElementById('edit-clienta-id').value        = id;
  document.getElementById('edit-clienta-nombre').value    = nombre;
  document.getElementById('edit-clienta-negocio').value   = negocio || '';
  // Separar código de país del número
  let codigoGuardado = '598';
  let numeroGuardado = telefono || '';
  if (numeroGuardado.startsWith('+54')) {
    codigoGuardado = '54';
    numeroGuardado = numeroGuardado.replace(/^\+54/, '');
  } else if (numeroGuardado.startsWith('+598')) {
    codigoGuardado = '598';
    numeroGuardado = numeroGuardado.replace(/^\+598/, '');
  } else {
    numeroGuardado = numeroGuardado.replace(/^\+?\d{2,3}/, '');
  }
  document.getElementById('edit-clienta-codigo').value   = codigoGuardado;
  document.getElementById('edit-clienta-telefono').value = numeroGuardado;
  document.getElementById('edit-clienta-email').value     = email;
  document.getElementById('edit-clienta-password').value  = '';
  document.getElementById('form-editar-clienta-error').classList.add('oculto');
  document.getElementById('modal-editar-clienta').classList.remove('oculto');
}

async function handleEditarClienta(e) {
  e.preventDefault();

  const id       = document.getElementById('edit-clienta-id').value;
  const nombre   = document.getElementById('edit-clienta-nombre').value.trim();
  const negocio  = document.getElementById('edit-clienta-negocio').value.trim();
  const telefonoInput = document.getElementById('edit-clienta-telefono').value.trim().replace(/\D/g,'');
  const codigoPais    = document.getElementById('edit-clienta-codigo').value;
  const telefono      = telefonoInput ? `+${codigoPais}${telefonoInput}` : null;
  const email         = document.getElementById('edit-clienta-email').value.trim();
  const password = document.getElementById('edit-clienta-password').value;

  if (!nombre || !email) {
    mostrarFormError('form-editar-clienta-error', 'Nombre y email son obligatorios');
    return;
  }
  if (password && password.length < 8) {
    mostrarFormError('form-editar-clienta-error', 'La contraseña debe tener al menos 8 caracteres');
    return;
  }

  try {
    const body = {
      nombre,
      nombre_negocio: negocio   || null,
      telefono:       telefono  || null,
      email,
    };
    if (password) body.password = password;

    const resp = await fetch(`${API_URL}/admin/usuarios/${id}`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (!data.ok) {
      mostrarFormError('form-editar-clienta-error', data.error || 'Error al guardar');
      return;
    }

    document.getElementById('modal-editar-clienta').classList.add('oculto');
    mostrarToast('✅ Clienta actualizada');
    await cargarUsuarios();

  } catch {
    mostrarFormError('form-editar-clienta-error', 'Error de conexión');
  }
}

// ═══════════════════════════════════════════════════════════
//  ENVIAR LINK POR MAIL
// ═══════════════════════════════════════════════════════════
async function enviarLinkPorMail(email, nombre, link) {
  if (!confirm(`¿Enviar el link de agenda a ${nombre} (${email})?`)) return;

  try {
    const resp = await fetch(`${API_URL}/admin/enviar-link`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ email, nombre, link }),
    });
    const data = await resp.json();
    if (!data.ok) { mostrarToast(data.error || 'Error al enviar', 'error'); return; }
    mostrarToast('📧 Link enviado por mail ✅');
  } catch {
    mostrarToast('Error de conexión', 'error');
  }
}
// ═══════════════════════════════════════════════════════════
//  LINK PÚBLICO DE REGISTRO
// ═══════════════════════════════════════════════════════════
function inicializarLinkRegistro() {
  const btn = document.getElementById('btn-compartir-registro');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const linkRegistro = `${window.location.origin}/registro.html`;
    const texto = encodeURIComponent(
      `Hola! Te invito a probar DEPIMÓVIL PRO, la agenda online para estéticas. ` +
      `Creá tu cuenta con 14 días gratis: ${linkRegistro}`
    );
    window.open(`https://wa.me/?text=${texto}`, '_blank');
  });
}
// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function mostrarFormError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('oculto');
}

function escaparHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function mostrarToast(msg, tipo = 'exito') {
  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.style.cssText = `
      position:fixed; top:70px; left:50%;
      transform:translateX(-50%) translateY(-80px);
      background:var(--marron); color:white;
      padding:11px 22px; border-radius:100px;
      font-size:13px; font-weight:600; z-index:9999;
      white-space:nowrap; box-shadow:0 6px 24px rgba(0,0,0,.2);
      transition:transform .35s cubic-bezier(.34,1.56,.64,1);
      pointer-events:none;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.background = tipo === 'error'
    ? 'var(--rojo)'
    : 'linear-gradient(135deg,var(--rosa-vino),var(--rosa-polvo))';

  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 10);

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-80px)';
  }, 3000);
}