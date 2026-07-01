'use strict';

// Ajuste comercial: el primer link público que se comparte con operadoras
// comunica 30 días de prueba, alineado con el alta real del sistema.
document.addEventListener('DOMContentLoaded', () => {
  const btnOriginal = document.getElementById('btn-compartir-registro');
  if (!btnOriginal) return;

  const btn = btnOriginal.cloneNode(true);
  btnOriginal.replaceWith(btn);

  btn.addEventListener('click', () => {
    const linkRegistro = `${window.location.origin}/registro.html`;
    const texto = encodeURIComponent(
      `Hola! Te invito a probar DEPIMÓVIL PRO, la agenda online para estéticas. ` +
      `Creá tu cuenta con 30 días gratis: ${linkRegistro}`
    );
    window.open(`https://wa.me/?text=${texto}`, '_blank');
  });
});
