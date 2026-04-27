'use strict';

// ═══════════════════════════════════════════════════════════
//  LOGIN.JS — DEPIMÓVIL PRO
//  Maneja el formulario de login y activación de invitación
// ═══════════════════════════════════════════════════════════

// ─── ELEMENTOS DOM ───────────────────────────────────────────
const formLogin      = document.getElementById('login-form');
const inputEmail     = document.getElementById('login-email');
const inputPassword  = document.getElementById('login-password');
const btnLogin       = document.getElementById('btn-login');
const btnLoginTexto  = document.getElementById('btn-login-texto');
const btnLoginLoader = document.getElementById('btn-login-loader');
const loginError     = document.getElementById('login-error');
const loginErrorMsg  = document.getElementById('login-error-msg');
const trialBanner    = document.getElementById('trial-banner');
const btnTogglePass  = document.getElementById('btn-toggle-pass');

// Invitación
const seccionInv     = document.getElementById('seccion-invitacion');
const formInv        = document.getElementById('form-invitacion');
const invToken       = document.getElementById('inv-token');
const invNombre      = document.getElementById('inv-nombre');
const invNegocio     = document.getElementById('inv-negocio');
const invPass        = document.getElementById('inv-pass');
const invPass2       = document.getElementById('inv-pass2');
const invError       = document.getElementById('inv-error');
const invErrorMsg    = document.getElementById('inv-error-msg');
const btnInv         = document.getElementById('btn-inv');
const btnInvTexto    = document.getElementById('btn-inv-texto');
const btnInvLoader   = document.getElementById('btn-inv-loader');
const btnMostrarInv  = document.getElementById('btn-mostrar-inv');

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Si ya hay sesión activa, redirigir a la app
  if (Sesion.estaActiva()) {
    window.location.href = '/index.html';    return;
  }

  // Verificar si hay token de invitación en la URL
  const params = new URLSearchParams(window.location.search);
  const tokenInv = params.get('inv');
  if (tokenInv) {
    mostrarSeccionInvitacion();
    invToken.value = tokenInv;
  }

  // Verificar si venía de sesión expirada
  const motivo = params.get('motivo');
  if (motivo === 'expirado') {
    mostrarError('Tu sesión expiró. Iniciá sesión nuevamente.');
  }

  bindEventos();
});

// ─── BIND EVENTOS ─────────────────────────────────────────────
function bindEventos() {
  // Submit login
  formLogin.addEventListener('submit', handleLogin);

  // Toggle password visible
  btnTogglePass.addEventListener('click', () => {
    const tipo = inputPassword.type === 'password' ? 'text' : 'password';
    inputPassword.type = tipo;
    btnTogglePass.textContent = tipo === 'password' ? '👁' : '🙈';
  });

  // Mostrar/ocultar sección invitación
  btnMostrarInv.addEventListener('click', () => {
    if (seccionInv.classList.contains('oculto')) {
      mostrarSeccionInvitacion();
    } else {
      ocultarSeccionInvitacion();
    }
  });

  // Submit invitación
  formInv.addEventListener('submit', handleInvitacion);

  // Limpiar errores al escribir
  inputEmail.addEventListener('input', () => limpiarError());
  inputPassword.addEventListener('input', () => limpiarError());
}

// ═══════════════════════════════════════════════════════════
//  HANDLER LOGIN
// ═══════════════════════════════════════════════════════════
async function handleLogin(e) {
  e.preventDefault();
  limpiarError();
  limpiarErroresCampos();

  const email    = inputEmail.value.trim();
  const password = inputPassword.value;

  // Validación básica frontend
  let hayError = false;

  if (!email) {
    mostrarErrorCampo('err-email', 'El email es requerido');
    hayError = true;
  } else if (!esEmailValido(email)) {
    mostrarErrorCampo('err-email', 'Email inválido');
    hayError = true;
  }

  if (!password) {
    mostrarErrorCampo('err-password', 'La contraseña es requerida');
    hayError = true;
  }

  if (hayError) return;

  // Mostrar loader
  setLoadingLogin(true);

  try {
    const data = await AuthAPI.login(email, password);

    if (!data?.ok) {
      mostrarError(data?.error || 'Error al iniciar sesión');
      return;
    }

    // Login exitoso — redirigir a la app
    window.location.href = '/index.html';

  } catch (err) {
    if (err.status === 429) {
      mostrarError('Demasiados intentos. Esperá 15 minutos.');
    } else if (err.status === 403) {
      mostrarError('Cuenta desactivada. Contactá al administrador.');
    } else {
      mostrarError(err.message || 'Error al conectar con el servidor');
    }
  } finally {
    setLoadingLogin(false);
  }
}

// ═══════════════════════════════════════════════════════════
//  HANDLER INVITACIÓN
// ═══════════════════════════════════════════════════════════
async function handleInvitacion(e) {
  e.preventDefault();
  limpiarErrorInv();

  const token        = invToken.value.trim();
  const nombre       = invNombre.value.trim();
  const nombreNegocio = invNegocio.value.trim();
  const password     = invPass.value;
  const password2    = invPass2.value;

  // Validaciones
  if (!token) {
    mostrarErrorInv('El código de invitación es requerido');
    return;
  }
  if (!nombre || nombre.length < 2) {
    mostrarErrorInv('El nombre debe tener al menos 2 caracteres');
    return;
  }
  if (!password || password.length < 8) {
    mostrarErrorInv('La contraseña debe tener al menos 8 caracteres');
    return;
  }
  if (password !== password2) {
    mostrarErrorInv('Las contraseñas no coinciden');
    return;
  }

  setLoadingInv(true);

  try {
    const data = await AuthAPI.activarInvitacion({
      token,
      nombre,
      nombreNegocio,
      password,
    });

    if (!data?.ok) {
      mostrarErrorInv(data?.error || 'Error al activar la cuenta');
      return;
    }

    // Cuenta activada — redirigir a la app
    window.location.href = '/index.html';

  } catch (err) {
    mostrarErrorInv(err.message || 'Error al activar la cuenta');
  } finally {
    setLoadingInv(false);
  }
}

// ═══════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════
function setLoadingLogin(loading) {
  btnLogin.disabled = loading;
  btnLoginTexto.classList.toggle('oculto', loading);
  btnLoginLoader.classList.toggle('oculto', !loading);
}

function setLoadingInv(loading) {
  btnInv.disabled = loading;
  btnInvTexto.classList.toggle('oculto', loading);
  btnInvLoader.classList.toggle('oculto', !loading);
}

function mostrarError(msg) {
  loginErrorMsg.textContent = msg;
  loginError.classList.remove('oculto');
  loginError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function limpiarError() {
  loginError.classList.add('oculto');
  loginErrorMsg.textContent = '';
}

function mostrarErrorCampo(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function limpiarErroresCampos() {
  ['err-email', 'err-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function mostrarErrorInv(msg) {
  invErrorMsg.textContent = msg;
  invError.classList.remove('oculto');
}

function limpiarErrorInv() {
  invError.classList.add('oculto');
  invErrorMsg.textContent = '';
}

function mostrarSeccionInvitacion() {
  seccionInv.classList.remove('oculto');
  btnMostrarInv.textContent = '✕ Cerrar activación de cuenta';
  seccionInv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function ocultarSeccionInvitacion() {
  seccionInv.classList.add('oculto');
  btnMostrarInv.textContent = '¿Tenés un código de invitación? Activá tu cuenta';
}

function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}