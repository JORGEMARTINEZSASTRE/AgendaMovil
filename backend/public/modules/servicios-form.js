'use strict';

// ═══════════════════════════════════════════════════════════
//  SERVICIOS FORM MODULE — AGENDAMÓVIL PRO
//  Ajustes UI del modal de alta/edición de servicios.
// ═══════════════════════════════════════════════════════════

(function serviciosFormModule() {
  function campoDe(id) {
    return document.getElementById(id)?.closest('.campo') || null;
  }

  function actualizarTextoCategoria(campoCategoria) {
    const inputCategoria = document.getElementById('serv-categoria');
    const ayuda = campoCategoria?.querySelector('small');

    if (inputCategoria) {
      inputCategoria.placeholder = 'Ej: Depilación láser, Facial, Corporal...';
      inputCategoria.autocomplete = 'off';
    }

    if (ayuda) {
      ayuda.textContent = 'Primero elegí la familia del servicio. Si lo dejás vacío se guarda como "General".';
    }
  }

  function actualizarTextoNombre() {
    const inputNombre = document.getElementById('serv-nombre');
    if (inputNombre) {
      inputNombre.placeholder = 'Ej: Axilas, Cavado completo, Pierna entera...';
    }
  }

  function ordenarCamposServicio() {
    const form = document.getElementById('form-servicio');
    const error = document.getElementById('form-servicio-error');
    const campoCategoria = campoDe('serv-categoria');
    const campoNombre = campoDe('serv-nombre');
    const campoPrecio = campoDe('serv-precio');

    if (!form || !error || !campoCategoria || !campoNombre || !campoPrecio) return;

    actualizarTextoCategoria(campoCategoria);
    actualizarTextoNombre();

    // Orden comercial correcto: Categoría → Nombre del servicio → Precio.
    error.insertAdjacentElement('afterend', campoCategoria);
    campoCategoria.insertAdjacentElement('afterend', campoNombre);
    campoNombre.insertAdjacentElement('afterend', campoPrecio);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ordenarCamposServicio, { once: true });
  } else {
    ordenarCamposServicio();
  }

  window.AgendaMovilServiciosForm = {
    ordenarCamposServicio,
  };
})();
