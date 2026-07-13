'use strict';
// ── Estado global ─────────────────────────────────────────────
var S = {
  view: 'selector',
  examenes: [], examen: null,
  gradoSeleccionado: null,
  est: { nombre:'', orden:0, grado:'', seccion:'', codigo:'' },
  resp: {}, ordenItems: {}, ultimoResultado: null,
  timerSec: 0, timerStart: 0, timerInterval: null,
  adminAuth: false, adminTab: 'examenes',
  adminExamen: null, respuestas: [], listaEst: [],
  qBuilders: [], currentQ: 0, pinHash: null
};

// ── Render principal ──────────────────────────────────────────
function render() {
  switch (S.view) {
    case 'selector':    renderSelector();    break;
    case 'gate':        renderGate();        break;
    case 'inicio':      renderInicio();      break;
    case 'historial':   renderHistorial();   break;
    case 'registro':    renderRegistro();    break;
    case 'examen':      renderExamen();      break;
    case 'enviado':     renderEnviado();     break;
    case 'admin-login': renderAdminLogin();  break;
    case 'admin':       renderAdmin();       break;
    case 'admin-crear': renderAdminCrear();  break;
    case 'admin-resp':  renderAdminResp();   break;
  }
}

// ── Arrancar ──────────────────────────────────────────────────
render();

// ── Banner de actualización SW ────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'SW_UPDATED') return;
    if (document.getElementById('sw-update-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;z-index:9999',
      'background:#1B3A6B;color:#fff',
      'padding:10px 16px',
      'display:flex;align-items:center;justify-content:space-between;gap:12px',
      'font-size:14px;font-family:inherit;box-shadow:0 -2px 8px rgba(0,0,0,.2)'
    ].join(';');
    banner.innerHTML = '<span>🆕 Nueva versión disponible</span>'
      + '<button onclick="window.location.reload()" style="'
      + 'background:#fff;color:#1B3A6B;border:none;border-radius:6px;'
      + 'padding:6px 14px;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap'
      + '">🔄 Recargar</button>';
    document.body.appendChild(banner);
  });
}
