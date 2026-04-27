'use strict';

// ═══════════════════════════════════════════════════════════
//  COLOR UTILS — DEPIMÓVIL PRO
//  Convierte colores saturados a pastel para combinar con la paleta
// ═══════════════════════════════════════════════════════════

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