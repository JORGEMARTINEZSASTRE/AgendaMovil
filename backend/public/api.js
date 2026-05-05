'use strict';

// ═══════════════════════════════════════════════════════════
//  API.JS — DEPIMÓVIL PRO
//  Cliente HTTP que consume la API REST
// ═══════════════════════════════════════════════════════════

const API_URL = 'https://agendamovil-production.up.railway.app/api';

// ─── HELPER: obtener token ───────────────────────────────
function getToken() {
  return localStorage.getItem('depimovil_token');
}

// ─── HELPER: guardar sesión ──────────────────────────────
function guardarSesion(token, usuario) {
  localStorage.setItem('depimovil_token',   token);
  localStorage.setItem('depimovil_usuario', JSON.stringify(usuario));
}

// ─── HELPER: limpiar sesión ──────────────────────────────
function limpiarSesion() {
  localStorage.removeItem('depimovil_token');
  localStorage.removeItem('depimovil_usuario');
}

// ─── HELPER: fetch con auth ──────────────────────────────
async function fetchAPI(endpoint, opciones = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...opciones.headers,
  };

  const resp = await fetch(`${API_URL}${endpoint}`, {
    ...opciones,
    headers,
  });

  // Token expirado o inválido
  if (resp.status === 401) {
    limpiarSesion();
    window.location.href = '/login.html?motivo=expirado';
    return;
  }

  const data = await resp.json();

  if (!resp.ok && resp.status !== 404) {
    const error = new Error(data?.error || `Error ${resp.status}`);
    error.status = resp.status;
    error.data   = data;
    throw error;
  }

  return data;
}

// ─── HELPER: apiCall con manejo de errores ───────────────
async function apiCall(fn, mensajeError = 'Error') {
  try {
    const data = await fn();
    return data?.turnos    ?? data?.turno
        ?? data?.servicios ?? data?.servicio
        ?? data?.config    ?? data?.cumples
        ?? data;
  } catch (err) {
    console.error(`[apiCall] ${mensajeError}:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  SESION
// ═══════════════════════════════════════════════════════════
const Sesion = {
  estaActiva() {
    return !!getToken();
  },

  getUsuario() {
    try {
      const u = localStorage.getItem('depimovil_usuario');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  diasTrial() {
    const usuario = this.getUsuario();
    if (!usuario || usuario.plan !== 'trial' || !usuario.trial_fin) return null;
    const fin  = new Date(usuario.trial_fin);
    const hoy  = new Date();
    const diff = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  },
};

// ═══════════════════════════════════════════════════════════
//  VERIFICAR ACCESO
//  Llama a /auth/me para validar token y plan
// ═══════════════════════════════════════════════════════════
async function verificarAcceso() {
  if (!Sesion.estaActiva()) {
    window.location.href = '/login.html';
    return false;
  }

  try {
    const data = await fetchAPI('/auth/me');
    if (!data?.ok) {
      limpiarSesion();
      window.location.href = '/login.html';
      return false;
    }

    // Actualizar datos del usuario en localStorage
    guardarSesion(getToken(), data.usuario);

    // Verificar plan activo
    const usuario = data.usuario;
    if (usuario.plan === 'trial' && usuario.trial_fin) {
      const fin = new Date(usuario.trial_fin);
      if (fin < new Date()) {
        limpiarSesion();
        window.location.href = '/login.html?motivo=trial_expirado';        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('[verificarAcceso]', err);
    limpiarSesion();
    window.location.href = '/login.html';
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH API
// ═══════════════════════════════════════════════════════════
const AuthAPI = {
  async login(email, password) {
    const data = await fetchAPI('/auth/login', {
      method: 'POST',
      body:   JSON.stringify({ email, password }),
    });
    if (data?.ok && data.token) {
      guardarSesion(data.token, data.usuario);
    }
    return data;
  },

  async activarInvitacion({ token, nombre, nombreNegocio, password }) {
    const data = await fetchAPI('/auth/activar-invitacion', {
      method: 'POST',
      body:   JSON.stringify({
        token,
        nombre,
        nombre_negocio: nombreNegocio,
        password,
      }),
    });
    if (data?.ok && data.token) {
      guardarSesion(data.token, data.usuario);
    }
    return data;
  },

  logout() {
    limpiarSesion();
    window.location.href = '/login.html';
  },
};

// ═══════════════════════════════════════════════════════════
//  TURNOS API
// ═══════════════════════════════════════════════════════════
const TurnosAPI = {
  async getAll(filtros = {}) {
    const params = new URLSearchParams(filtros).toString();
    const data   = await fetchAPI(`/turnos${params ? '?' + params : ''}`);
    return data?.turnos ?? [];
  },

  async getById(id) {
    const data = await fetchAPI(`/turnos/${id}`);
    return data?.turno ?? null;
  },

  async getCumples() {
    const data = await fetchAPI('/turnos/cumples');
    return data?.cumples ?? [];
  },

  async crear(payload) {
    return await fetchAPI('/turnos', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
  },

  async actualizar(id, payload) {
    return await fetchAPI(`/turnos/${id}`, {
      method: 'PUT',
      body:   JSON.stringify(payload),
    });
  },

  async eliminar(id) {
    return await fetchAPI(`/turnos/${id}`, {
      method: 'DELETE',
    });
  },

  async confirmarSenia(id) {
    return await fetchAPI(`/turnos/${id}/confirmar-senia`, {
      method: 'POST',
    });
  },
};

// ═══════════════════════════════════════════════════════════
//  SERVICIOS API
// ═══════════════════════════════════════════════════════════
const ServiciosAPI = {
  async getAll() {
    const data = await fetchAPI('/servicios');
    return data?.servicios ?? [];
  },

  async getById(id) {
    const data = await fetchAPI(`/servicios/${id}`);
    return data?.servicio ?? null;
  },

  async crear(payload) {
    return await fetchAPI('/servicios', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
  },

  async actualizar(id, payload) {
    return await fetchAPI(`/servicios/${id}`, {
      method: 'PUT',
      body:   JSON.stringify(payload),
    });
  },

  async eliminar(id) {
    return await fetchAPI(`/servicios/${id}`, {
      method: 'DELETE',
    });
  },

  async subirFoto(id, file) {
    const token = getToken();
    const formData = new FormData();
    formData.append('foto', file);

    const resp = await fetch(`${API_URL}/fichas/servicio/${id}/foto`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!resp.ok) {
      const data = await resp.json();
      throw new Error(data?.error || `Error ${resp.status}`);
    }

    return await resp.json();
  },

  async eliminarFoto(id) {
    return await fetchAPI(`/fichas/servicio/${id}/foto`, {
      method: 'DELETE',
    });
  },
};

// ═══════════════════════════════════════════════════════════
//  CONFIG API
// ═══════════════════════════════════════════════════════════
const ConfigAPI = {
  async get() {
    const data = await fetchAPI('/config');
    return data?.config ?? null;
  },

  async guardar(payload) {
    return await fetchAPI('/config', {
      method: 'PUT',
      body:   JSON.stringify(payload),
    });
  },

  async subirLogo(file) {
    const token = getToken();
    const formData = new FormData();
    formData.append('logo', file);

    const resp = await fetch(`${API_URL}/config/logo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!resp.ok) {
      const data = await resp.json();
      throw new Error(data?.error || `Error ${resp.status}`);
    }

    return await resp.json();
  },

  async eliminarLogo() {
    return await fetchAPI('/config/logo', {
      method: 'DELETE',
    });
  },
};

// ═══════════════════════════════════════════════════════════
//  WHATSAPP QUEUE
// ═══════════════════════════════════════════════════════════
const WaAPI = {
  async listar({ soloPendientes = true } = {}) {
    const params = new URLSearchParams({ soloPendientes });
    const data = await fetchAPI(`/wa/pendientes?${params}`);
    return {
      mensajes: data?.mensajes ?? [],
      pendientes: data?.pendientes ?? 0,
    };
  },

  async marcarEnviado(id) {
    return await fetchAPI(`/wa/${id}/enviado`, { method: 'POST' });
  },

  async eliminar(id) {
    return await fetchAPI(`/wa/${id}`, { method: 'DELETE' });
  },
};
// ═══════════════════════════════════════════════════════════
//  WHATSAPP CONEXIÓN API
// ═══════════════════════════════════════════════════════════
const SucursalesAPI = {
  async listar() {
    const data = await fetchAPI('/sucursales');
    return data?.sucursales ?? [];
  },

  async crear(payload) {
    return await fetchAPI('/sucursales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async obtenerHorarios(id) {
    return await fetchAPI(`/sucursales/${id}/horarios`);
  },

  async guardarHorarios(id, horarios) {
    return await fetchAPI(`/sucursales/${id}/horarios`, {
      method: 'PUT',
      body: JSON.stringify({ horarios }),
    });
  },
};

const WhatsAppAPI = {
  async obtenerEstado() {
    return await fetchAPI('/whatsapp/estado');
  },

  async conectar(telefono = null) {
    return await fetchAPI('/whatsapp/conectar', {
      method: 'POST',
      body: JSON.stringify(telefono ? { telefono } : {}),
    });
  },

  async desconectar() {
    return await fetchAPI('/whatsapp/desconectar', {
      method: 'POST',
    });
  },

  async enviarTest(telefono, mensaje) {
    return await fetchAPI('/whatsapp/test', {
      method: 'POST',
      body: JSON.stringify({ telefono, mensaje }),
    });
  },
};