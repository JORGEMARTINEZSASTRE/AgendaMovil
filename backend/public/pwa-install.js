/* DepiMóvil — botón "Instalar app" (PWA). Compartido por todas las apps. */
(function () {
  'use strict';

  var APP = (document.querySelector('meta[name="app-nombre"]') || {}).content || 'la app';
  var KEY = 'pwa_oculto_' + location.pathname;

  // El botón toma el color de cada app
  var COLOR = (document.querySelector('meta[name="theme-color"]') || {}).content || '#213c22';
  var BORDE = (document.querySelector('meta[name="app-color-borde"]') || {}).content || '#b08d3c';

  // Ya está instalada: no molestar.
  var instalada = window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone === true;
  if (instalada) return;

  // Service worker (necesario para que el celular ofrezca instalar)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var evento = null;

  function estilos() {
    var s = document.createElement('style');
    s.textContent =
      '#pwaBtn{position:fixed;right:14px;bottom:108px;z-index:99998;display:none;' +
      'align-items:center;gap:8px;background:' + COLOR + ';color:#fff;border:2px solid ' + BORDE + ';' +
      'border-radius:999px;padding:11px 16px;font:600 15px/1 system-ui,sans-serif;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.28);cursor:pointer}' +
      '#pwaBtn b{font-weight:800}' +
      '#pwaX{position:fixed;right:8px;bottom:150px;z-index:99999;display:none;' +
      'width:24px;height:24px;border-radius:50%;background:#fff;color:' + COLOR + ';border:1px solid #ccc;' +
      'font:700 13px/1 system-ui,sans-serif;cursor:pointer}' +
      '#pwaModal{position:fixed;inset:0;z-index:99999;display:none;background:rgba(0,0,0,.55);' +
      'align-items:center;justify-content:center;padding:20px}' +
      '#pwaCaja{background:#fff;border-radius:18px;padding:22px;max-width:340px;width:100%;' +
      'font:15px/1.5 system-ui,sans-serif;color:#203b22;text-align:left}' +
      '#pwaCaja h3{margin:0 0 12px;font-size:19px;color:' + COLOR + '}' +
      '#pwaCaja ol{margin:0 0 16px 18px;padding:0}' +
      '#pwaCaja li{margin-bottom:9px}' +
      '#pwaCerrar{width:100%;background:' + COLOR + ';color:#fff;border:0;border-radius:12px;' +
      'padding:12px;font:700 15px system-ui,sans-serif;cursor:pointer}';
    document.head.appendChild(s);
  }

  function mostrar() {
    if (localStorage.getItem(KEY) === '1') return;
    document.getElementById('pwaBtn').style.display = 'flex';
    document.getElementById('pwaX').style.display = 'block';
  }

  function ocultar(recordar) {
    document.getElementById('pwaBtn').style.display = 'none';
    document.getElementById('pwaX').style.display = 'none';
    if (recordar) localStorage.setItem(KEY, '1');
  }

  function armar() {
    estilos();

    var btn = document.createElement('button');
    btn.id = 'pwaBtn';
    btn.innerHTML = '📲 <b>Instalar app</b>';
    document.body.appendChild(btn);

    var x = document.createElement('button');
    x.id = 'pwaX';
    x.textContent = '✕';
    x.title = 'No mostrar más';
    document.body.appendChild(x);

    var modal = document.createElement('div');
    modal.id = 'pwaModal';
    modal.innerHTML =
      '<div id="pwaCaja">' +
      '<h3>📲 Agregar ' + APP + ' a tu inicio</h3>' +
      '<ol>' +
      '<li>Tocá el botón <b>Compartir</b> abajo de la pantalla (el cuadradito con la flecha hacia arriba).</li>' +
      '<li>Deslizá y elegí <b>“Agregar a inicio”</b>.</li>' +
      '<li>Tocá <b>Agregar</b> arriba a la derecha.</li>' +
      '</ol>' +
      '<p style="margin:0 0 16px;color:#6b7d6c">Te queda el ícono en el celular, como cualquier app.</p>' +
      '<button id="pwaCerrar">Entendido</button>' +
      '</div>';
    document.body.appendChild(modal);

    x.onclick = function () { ocultar(true); };

    document.getElementById('pwaCerrar').onclick = function () {
      modal.style.display = 'none';
    };
    modal.onclick = function (e) {
      if (e.target === modal) modal.style.display = 'none';
    };

    btn.onclick = function () {
      if (evento) {
        evento.prompt();
        evento.userChoice.then(function (r) {
          if (r.outcome === 'accepted') ocultar(true);
          evento = null;
        });
      } else {
        modal.style.display = 'flex';
      }
    };

    // Android / Chrome: el navegador avisa que se puede instalar
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      evento = e;
      mostrar();
    });

    // iPhone: nunca dispara el evento, mostramos el botón con instrucciones
    if (esIOS) setTimeout(mostrar, 1500);

    window.addEventListener('appinstalled', function () { ocultar(true); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', armar);
  } else {
    armar();
  }
})();
