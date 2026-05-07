'use strict';

// ═══════════════════════════════════════════════════════════
//  LOGIN.JS — AGENDAMOVIL PRO
// ═══════════════════════════════════════════════════════════

// ─── DOM ──────────────────────────────────────────────────
const formLogin       = document.getElementById('login-form');
const inputEmail      = document.getElementById('login-email');
const inputPassword   = document.getElementById('login-password');
const btnLogin        = document.getElementById('btn-login');
const btnLoginTexto   = document.getElementById('btn-login-texto');
const btnLoginLoader  = document.getElementById('btn-login-loader');
const loginError      = document.getElementById('login-error');
const loginErrorMsg   = document.getElementById('login-error-msg');
const trialBanner     = document.getElementById('trial-banner');
const btnTogglePass   = document.getElementById('btn-toggle-pass');

// Tabs
const tabLogin        = document.getElementById('tab-login');
const tabRegistro     = document.getElementById('tab-registro');
const cardLogin       = document.getElementById('card-login');
const cardRegistro    = document.getElementById('card-registro');
const btnIrRegistro   = document.getElementById('btn-ir-registro');
const btnIrLogin      = document.getElementById('btn-ir-login');

// Registro
const formRegistro    = document.getElementById('registro-form');
const btnRegistro     = document.getElementById('btn-registro');
const btnRegTexto     = document.getElementById('btn-reg-texto');
const btnRegLoader    = document.getElementById('btn-reg-loader');
const regError        = document.getElementById('reg-error');
const regErrorMsg     = document.getElementById('reg-error-msg');
const regExito        = document.getElementById('reg-exito');
const regExitoMsg     = document.getElementById('reg-exito-msg');
const btnToggleRegPass = document.getElementById('btn-toggle-reg-pass');

// Invitación
const seccionInv      = document.getElementById('seccion-invitacion');
const formInv         = document.getElementById('form-invitacion');
const invToken        = document.getElementById('inv-token');
const invNombre       = document.getElementById('inv-nombre');
const invNegocio      = document.getElementById('inv-negocio');
const invPass         = document.getElementById('inv-pass');
const invPass2        = document.getElementById('inv-pass2');
const invError        = document.getElementById('inv-error');
const invErrorMsg     = document.getElementById('inv-error-msg');
const btnInv          = document.getElementById('btn-inv');
const btnInvTexto     = document.getElementById('btn-inv-texto');
const btnInvLoader    = document.getElementById('btn-inv-loader');

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (Sesion.estaActiva()) {
    window.location.href = '/index.html';
    return;
  }

  const params   = new URLSearchParams(window.location.search);
  const tokenInv = params.get('inv');
  const motivo   = params.get('motivo');
  const modo     = params.get('modo');

  if (tokenInv) {
    mostrarSeccionInvitacion();
    invToken.value = tokenInv;
  }

  if (motivo === 'expirado') {
    mostrarError('Tu sesión expiró. Iniciá sesión nuevamente.');
  }

  if (modo === 'registro') {
    mostrarRegistro();
  }

  bindEventos();
});

// ─── BIND ─────────────────────────────────────────────────
function bindEventos() {
  // Login
  formLogin.addEventListener('submit', handleLogin);
  btnTogglePass.addEventListener('click', () => togglePass(inputPassword, btnTogglePass));
  inputEmail.addEventListener('input', limpiarError);
  inputPassword.addEventListener('input', limpiarError);

  // Tabs
  tabLogin.addEventListener('click', mostrarLogin);
  tabRegistro.addEventListener('click', mostrarRegistro);
  btnIrRegistro?.addEventListener('click', mostrarRegistro);
  btnIrLogin?.addEventListener('click', mostrarLogin);

  // Registro
  formRegistro.addEventListener('submit', handleRegistro);
  btnToggleRegPass?.addEventListener('click', () => {
    const inp = document.getElementById('reg-password');
    togglePass(inp, btnToggleRegPass);
  });

  // Invitación
  formInv.addEventListener('submit', handleInvitacion);
}

// ─── TABS ──────────────────────────────────────────────────
function mostrarLogin() {
  cardLogin.classList.remove('oculto');
  cardRegistro.classList.add('oculto');
  tabLogin.classList.add('activo');
  tabRegistro.classList.remove('activo');
  document.getElementById('login-titulo-header').textContent = 'Bienvenida';
  document.getElementById('login-sub-header').textContent = 'Ingresá a tu agenda inteligente';
}

function mostrarRegistro() {
  cardRegistro.classList.remove('oculto');
  cardLogin.classList.add('oculto');
  tabRegistro.classList.add('activo');
  tabLogin.classList.remove('activo');
  document.getElementById('login-titulo-header').textContent = '14 días gratis';
  document.getElementById('login-sub-header').textContent = 'Creá tu agenda en menos de un minuto';
}

// ─── HANDLER LOGIN ─────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  limpiarError();
  limpiarErroresCampos();

  const email    = inputEmail.value.trim();
  const password = inputPassword.value;
  let hayError   = false;

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

  setLoadingLogin(true);
  try {
    const data = await AuthAPI.login(email, password);
    if (!data?.ok) {
      mostrarError(data?.error || 'Error al iniciar sesión');
      return;
    }
    window.location.href = '/index.html';
  } catch (err) {
    if (err.status === 429)      mostrarError('Demasiados intentos. Esperá 15 minutos.');
    else if (err.status === 403) mostrarError('Cuenta desactivada. Contactá al administrador.');
    else                         mostrarError(err.message || 'Error al conectar con el servidor');
  } finally {
    setLoadingLogin(false);
  }
}

// ─── HANDLER REGISTRO ──────────────────────────────────────
async function handleRegistro(e) {
  e.preventDefault();
  limpiarErrorReg();

  // Honeypot
  const honeypot = document.getElementById('reg-honeypot');
  if (honeypot?.value) return;

  const nombre   = document.getElementById('reg-nombre').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const telefono = document.getElementById('reg-telefono').value.trim() || null;
  const codigoPais = document.getElementById('reg-codigo-pais').value;
  const acepto   = document.getElementById('reg-acepto').checked;

  let hayError = false;

  if (!nombre || nombre.length < 2) {
    mostrarErrorCampoReg('err-reg-nombre', 'Mínimo 2 caracteres');
    hayError = true;
  }
  if (!email || !esEmailValido(email)) {
    mostrarErrorCampoReg('err-reg-email', 'Email inválido');
    hayError = true;
  }
  if (!password || password.length < 8) {
    mostrarErrorCampoReg('err-reg-password', 'Mínimo 8 caracteres');
    hayError = true;
  }
  if (!acepto) {
    mostrarErrorCampoReg('err-reg-terms', 'Aceptá los términos para continuar');
    hayError = true;
  }
  if (hayError) return;

  setLoadingReg(true);
  try {
    const res = await fetch(`${API_URL}/publica/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password, codigo_pais: codigoPais, telefono }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      mostrarErrorReg(data.error || 'No se pudo crear la cuenta');
      return;
    }

    localStorage.setItem('depimovil_token',   data.token);
    localStorage.setItem('depimovil_usuario', JSON.stringify(data.usuario));

    regExitoMsg.textContent = '¡Cuenta creada! Redirigiendo...';
    regExito.classList.remove('oculto');
    formRegistro.style.display = 'none';

    setTimeout(() => { window.location.href = '/index.html'; }, 1400);

  } catch (err) {
    mostrarErrorReg('Error de conexión. Probá de nuevo.');
  } finally {
    setLoadingReg(false);
  }
}

// ─── HANDLER INVITACIÓN ────────────────────────────────────
async function handleInvitacion(e) {
  e.preventDefault();
  limpiarErrorInv();

  const token         = invToken.value.trim();
  const nombre        = invNombre.value.trim();
  const nombreNegocio = invNegocio.value.trim();
  const password      = invPass.value;
  const password2     = invPass2.value;

  if (!token)                        { mostrarErrorInv('El código es requerido'); return; }
  if (!nombre || nombre.length < 2)  { mostrarErrorInv('El nombre debe tener al menos 2 caracteres'); return; }
  if (!password || password.length < 8) { mostrarErrorInv('La contraseña debe tener al menos 8 caracteres'); return; }
  if (password !== password2)        { mostrarErrorInv('Las contraseñas no coinciden'); return; }

  setLoadingInv(true);
  try {
    const data = await AuthAPI.activarInvitacion({ token, nombre, nombreNegocio, password });
    if (!data?.ok) { mostrarErrorInv(data?.error || 'Error al activar la cuenta'); return; }
    window.location.href = '/index.html';
  } catch (err) {
    mostrarErrorInv(err.message || 'Error al activar la cuenta');
  } finally {
    setLoadingInv(false);
  }
}

// ─── HELPERS ──────────────────────────────────────────────
function togglePass(input, btn) {
  const tipo = input.type === 'password' ? 'text' : 'password';
  input.type = tipo;
  btn.textContent = tipo === 'password' ? '👁' : '🙈';
}

function mostrarSeccionInvitacion() {
  seccionInv.classList.remove('oculto');
  seccionInv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setLoadingLogin(loading) {
  btnLogin.disabled = loading;
  btnLoginTexto.classList.toggle('oculto', loading);
  btnLoginLoader.classList.toggle('oculto', !loading);
}

function setLoadingReg(loading) {
  btnRegistro.disabled = loading;
  btnRegTexto.classList.toggle('oculto', loading);
  btnRegLoader.classList.toggle('oculto', !loading);
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

function mostrarErrorReg(msg) {
  regErrorMsg.textContent = msg;
  regError.classList.remove('oculto');
}

function limpiarErrorReg() {
  regError.classList.add('oculto');
  regErrorMsg.textContent = '';
  ['err-reg-nombre','err-reg-email','err-reg-password','err-reg-terms'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function mostrarErrorCampoReg(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function mostrarErrorInv(msg) {
  invErrorMsg.textContent = msg;
  invError.classList.remove('oculto');
}

function limpiarErrorInv() {
  invError.classList.add('oculto');
  invErrorMsg.textContent = '';
}

function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
