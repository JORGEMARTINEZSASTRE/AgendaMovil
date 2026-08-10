'use strict';

/**
 * Imagen por defecto para un servicio que no tiene foto propia.
 *
 * Son 16 siluetas dibujadas con la paleta de DepiMóvil, servidas desde
 * depimovil.live/zonas/. La operadora no tiene que hacer nada: si el
 * servicio se llama "Axilas" o su zona es "Piernas completas", la imagen
 * aparece sola. En cuanto sube una foto real, esa gana.
 *
 * Se busca por palabra dentro del nombre y de la zona. El orden de la
 * lista importa: "media pierna" tiene que probarse antes que "pierna",
 * si no toda media pierna caería en piernas completas.
 *
 * Si nada coincide se devuelve null a propósito. Antes de poner una
 * silueta de depilación en un servicio de uñas o de masajes, es mejor
 * no poner nada: la genérica sale solo cuando el texto habla de
 * depilación pero no dice de qué zona.
 */

const BASE = 'https://depimovil.live/zonas';

const ZONAS = [
  { archivo: 'media-pierna', claves: ['media pierna', 'medias piernas', '1/2 pierna'] },
  { archivo: 'medio-brazo',  claves: ['medio brazo', 'medios brazos', '1/2 brazo'] },
  { archivo: 'axilas',       claves: ['axila'] },
  { archivo: 'bozo',         claves: ['bozo', 'labio superior', 'bigote'] },
  { archivo: 'menton',       claves: ['menton', 'mentón'] },
  { archivo: 'patillas',     claves: ['patilla'] },
  { archivo: 'rostro',       claves: ['rostro', 'cara completa', 'facial', 'entrecejo', 'cejas'] },
  { archivo: 'cuello',       claves: ['cuello', 'nuca'] },
  { archivo: 'brazos',       claves: ['brazo'] },
  { archivo: 'pecho',        claves: ['pecho', 'busto', 'areola'] },
  { archivo: 'abdomen',      claves: ['abdomen', 'panza', 'ombligo', 'linea alba'] },
  { archivo: 'espalda',      claves: ['espalda', 'lumbar', 'zona lumbar'] },
  { archivo: 'bikini',       claves: ['bikini', 'cavado', 'ingle', 'pubis', 'tiro alto', 'brasilera', 'brasileña', 'vip'] },
  { archivo: 'gluteos',      claves: ['gluteo', 'gluteos'] },
  { archivo: 'piernas',      claves: ['pierna', 'muslo', 'pantorrilla', 'rodilla', 'empeine'] },
  // Última: solo si habla de depilación sin decir de qué zona.
  { archivo: 'general',      claves: ['depilacion', 'depilar', 'depilado', 'cera', 'laser', 'láser', 'waxing', 'sugaring', 'luz pulsada', 'cuerpo completo', 'full body'] },
];

/** Minúsculas, sin tildes y con los espacios prolijos, para poder comparar. */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devuelve el nombre de archivo de la zona que aparece en el texto, o null. */
function archivoDeTexto(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  for (const zona of ZONAS) {
    if (zona.claves.some(clave => t.includes(normalizar(clave)))) return zona.archivo;
  }
  return null;
}

/**
 * URL de la imagen que le corresponde a un servicio, o null si no se
 * puede saber de qué zona habla.
 *
 * Se mira primero la zona (es el campo pensado para esto) y después el
 * nombre, porque hay operadoras que cargan "Sin zona" y ponen todo en
 * el nombre.
 */
function imagenDeZona(nombre, zona) {
  const archivo = archivoDeTexto(zona) || archivoDeTexto(nombre);
  return archivo ? `${BASE}/${archivo}.png` : null;
}

/** Igual, pero recibiendo el servicio entero. Cómodo para los .map(). */
function imagenDeServicio(servicio) {
  if (!servicio) return null;
  return imagenDeZona(servicio.nombre, servicio.zona);
}

module.exports = { imagenDeZona, imagenDeServicio, normalizar, BASE };
