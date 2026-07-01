'use strict';

// ═══════════════════════════════════════════════════════════
//  COLOR UTILS — DEPIMÓVIL PRO
//  Convierte colores saturados a pastel para combinar con la paleta
// ═══════════════════════════════════════════════════════════

const ZONAS_DEPILACION_SUGERIDAS = [
  'Bozo',
  'Mentón',
  'Rostro completo',
  'Cuello',
  'Nuca',
  'Axilas',
  'Brazos completos',
  'Medio brazo',
  'Manos y dedos',
  'Pecho',
  'Abdomen',
  'Línea alba',
  'Espalda completa',
  'Media espalda',
  'Hombros',
  'Glúteos',
  'Cavado simple',
  'Cavado completo',
  'Cavado bikini',
  'Tira de cola',
  'Pierna entera',
  'Media pierna',
  'Muslos',
  'Rodillas',
  'Pies y dedos',
  'Cuerpo completo',
];

function asegurarDatalistZonasDepilacion(inputZona, campoZona) {
  if (!inputZona || !campoZona) return;

  const datalistId = 'zonas-depilacion-sugeridas';
  let datalist = document.getElementById(datalistId);

  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = datalistId;
    datalist.innerHTML = ZONAS_DEPILACION_SUGERIDAS
      .map(zona => `<option value="${zona}"></option>`)
      .join('');
    campoZona.appendChild(datalist);
  }

  inputZona.setAttribute('list', datalistId);
  inputZona.autocomplete = 'off';

  let ayuda = campoZona.querySelector('[data-zonas-depi-help]');
  if (!ayuda) {
    ayuda = document.createElement('small');
    ayuda.dataset.zonasDepiHelp = 'true';
    ayuda.style.cssText = 'font-size:11px;color:var(--gris);margin-top:4px;display:block';
    campoZona.appendChild(ayuda);
  }
  ayuda.textContent = 'Elegí una zona sugerida o escribí una nueva.';
}

/**
 * Ajustes tempranos de UI.
 * Este archivo se carga antes que app.js, por eso es buen lugar para
 * normalizar el DOM antes de que se registren los eventos principales.
 */
function normalizarFormularioServicios() {
  const campoDe = (id) => document.getElementById(id)?.closest('.campo') || null;

  const form = document.getElementById('form-servicio');
  const error = document.getElementById('form-servicio-error');
  const campoCategoria = campoDe('serv-categoria');
  const campoNombre = campoDe('serv-nombre');
  const campoPrecio = campoDe('serv-precio');
  const campoZona = campoDe('serv-zona');

  if (!form || !error || !campoCategoria || !campoNombre || !campoPrecio) return;

  const inputCategoria = document.getElementById('serv-categoria');
  const ayudaCategoria = campoCategoria.querySelector('small');
  const inputNombre = document.getElementById('serv-nombre');
  const inputZona = document.getElementById('serv-zona');
  const labelZona = campoZona?.querySelector('label');

  if (inputCategoria) {
    inputCategoria.placeholder = 'Ej: Depilación láser, Facial, Corporal...';
    inputCategoria.autocomplete = 'off';
  }

  if (ayudaCategoria) {
    ayudaCategoria.textContent = 'Primero elegí la familia del servicio. Si lo dejás vacío se guarda como "General".';
  }

  if (inputNombre) {
    inputNombre.placeholder = 'Ej: Axilas, Cavado completo, Pierna entera...';
  }

  if (inputZona) {
    inputZona.required = false;
    inputZona.removeAttribute('required');
    inputZona.placeholder = 'Elegí una zona. Ej: Axilas, cavado completo, pierna entera...';
    asegurarDatalistZonasDepilacion(inputZona, campoZona);
  }

  if (labelZona) {
    labelZona.textContent = '📍 Zona de depilación (opcional)';
  }

  // Orden comercial correcto: Categoría → Nombre del servicio → Precio.
  error.insertAdjacentElement('afterend', campoCategoria);
  campoCategoria.insertAdjacentElement('afterend', campoNombre);
  campoNombre.insertAdjacentElement('afterend', campoPrecio);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalizarFormularioServicios, { once: true });
  } else {
    normalizarFormularioServicios();
  }
}

/**
 * Convierte un HEX a {r,g,b}
 */
function hexToRgb(hex) {
  if (!hex) return { r: 168, g: 85, b: 104 }; // fallback rosa-vino
  const h = hex.replace('#', '').trim();
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h.padEnd(6, '0');
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Devuelve un pastel (mezclado con crema) a partir de un HEX.
 * mix = cantidad de crema a agregar (0 = color puro, 1 = todo crema)
 */
function toPastel(hex, mix = 0.78) {
  const { r, g, b } = hexToRgb(hex);
  // Mezcla con #FDF8F3 (var(--crema)) en lugar de blanco puro
  const cr = 253, cg = 248, cb = 243;
  const pr = Math.round(r + (cr - r) * mix);
  const pg = Math.round(g + (cg - g) * mix);
  const pb = Math.round(b + (cb - b) * mix);
  return `rgb(${pr},${pg},${pb})`;
}

/**
 * Oscurece un color para usarlo como texto legible sobre el pastel.
 */
function darken(hex, amount = 0.5) {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `rgb(${dr},${dg},${db})`;
}

/**
 * Devuelve los 3 colores listos para un turno:
 *   fondo    → pastel
 *   borde    → color original (acento)
 *   texto    → color oscurecido (legible)
 */
function coloresTurno(hexBase) {
  const base = hexBase || '#A85568';
  return {
    fondo:  toPastel(base, 0.78),
    borde:  base,
    texto:  darken(base, 0.55),
    sombra: `0 2px 8px ${toPastel(base, 0.65)}`,
  };
}
