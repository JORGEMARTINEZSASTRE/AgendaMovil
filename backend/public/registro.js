const form = document.getElementById('registroForm');
const btn = document.getElementById('btnRegistrar');
const msg = document.getElementById('mensaje');

function mostrarMsg(texto, tipo = 'error') {
  msg.textContent = texto;
  msg.className = `mensaje ${tipo}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'mensaje';

  // Honeypot: si un bot llenó el campo oculto, fingimos éxito sin hacer nada
  if (form.website && form.website.value) {
    mostrarMsg('¡Cuenta creada! Redirigiendo...', 'ok');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  const data = {
    nombre: form.nombre.value.trim(),
    email: form.email.value.trim().toLowerCase(),
    password: form.password.value,
    codigo_pais: form.codigo_pais.value,
    telefono: form.telefono.value.trim() || null,
  };

  try {
    const res = await fetch(`${API_URL}/publica/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      mostrarMsg(json.error || 'No se pudo crear la cuenta');
      btn.disabled = false;
      btn.textContent = 'Crear mi cuenta';
      return;
    }

    // Guardar token y usuario con las mismas keys del resto de la app
    localStorage.setItem('depimovil_token', json.token);
    localStorage.setItem('depimovil_usuario', JSON.stringify(json.usuario));

    mostrarMsg('¡Cuenta creada! Redirigiendo...', 'ok');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1200);
  } catch (err) {
    console.error(err);
    mostrarMsg('Error de conexión. Probá de nuevo.');
    btn.disabled = false;
    btn.textContent = 'Crear mi cuenta';
  }
});