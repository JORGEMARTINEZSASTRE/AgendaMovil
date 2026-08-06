'use strict';

/**
 * Calcula cuánta seña pide un servicio.
 *
 * Hay dos formas de configurarla:
 *   - 'monto'      -> un valor fijo, como fue siempre (monto_senia)
 *   - 'porcentaje' -> un % del precio del servicio
 *
 * El porcentaje se recalcula sobre el precio actual, asi que cuando la
 * operadora sube los precios las señas se ajustan solas.
 *
 * Se redondea al peso: no tiene sentido pedir una seña con centavos.
 */
function calcularSenia(servicio) {
  if (!servicio || !servicio.requiere_senia) return 0;

  if (servicio.senia_tipo === 'porcentaje') {
    const precio     = Number(servicio.precio) || 0;
    const porcentaje = Number(servicio.senia_porcentaje) || 0;
    if (precio <= 0 || porcentaje <= 0) return 0;
    return Math.round(precio * porcentaje / 100);
  }

  return Math.round(Number(servicio.monto_senia) || 0);
}

/**
 * Texto corto para mostrarle a la operadora cómo quedó configurada.
 * Ej: "30% ($450)" o "$200".
 */
function descripcionSenia(servicio) {
  const monto = calcularSenia(servicio);
  if (!monto) return 'Sin seña';

  if (servicio.senia_tipo === 'porcentaje') {
    return `${Number(servicio.senia_porcentaje)}% ($${monto.toLocaleString('es-UY')})`;
  }
  return `$${monto.toLocaleString('es-UY')}`;
}

module.exports = { calcularSenia, descripcionSenia };
