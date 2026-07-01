'use strict';

// Ajuste comercial: el primer link público que se comparte con operadoras
// comunica 30 días de prueba, alineado con el alta real del sistema.
(function configurarLinkRegistro30Dias() {
  const MENSAJE_30_DIAS = 'Hola! Te invito a probar DEPIMÓVIL PRO, la agenda online para estéticas. ';

  function abrirWhatsAppRegistro30Dias() {
    const linkRegistro = `${window.location.origin}/registro.html`;
    const texto = encodeURIComponent(
      MENSAJE_30_DIAS + `Creá tu cuenta con 30 días gratis: ${linkRegistro}`
    );
    window.open(`https://wa.me/?text=${texto}`, '_blank');
  }

  function instalarHandler() {
    const btn = document.getElementById('btn-compartir-registro');
    if (!btn || btn.dataset.trial30Ready === 'true') return;

    btn.dataset.trial30Ready = 'true';
    btn.title = 'Compartir link de registro — 30 días gratis';

    // Captura el click antes que listeners legacy de admin.js y evita
    // que también se dispare el mensaje anterior de 14 días.
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      abrirWhatsAppRegistro30Dias();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalarHandler, { once: true });
  } else {
    instalarHandler();
  }
})();

// Carga de módulos pequeños del panel admin.
(function cargarModuloAccionesSucursales() {
  if (document.querySelector('script[data-module="admin-sucursales-actions"]')) return;

  const script = document.createElement('script');
  script.src = 'admin-sucursales-actions.js';
  script.defer = true;
  script.dataset.module = 'admin-sucursales-actions';
  document.head.appendChild(script);
})();
