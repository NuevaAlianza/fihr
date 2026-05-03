'use strict';
// ── Estado global ─────────────────────────────────────────────
var S = {
  view: 'selector',
  examenes: [], examen: null,
  gradoSeleccionado: null,
  est: { nombre:'', orden:0, grado:'', seccion:'', codigo:'' },
  resp: {}, ordenItems: {},
  timerSec: 0, timerStart: 0, timerInterval: null,
  adminAuth: false, adminTab: 'examenes',
  adminExamen: null, respuestas: [], listaEst: [],
  qBuilders: [], currentQ: 0, pinHash: null
};

// ── Render principal ──────────────────────────────────────────
function render() {
  switch (S.view) {
    case 'selector':    renderSelector();    break;
    case 'inicio':      renderInicio();      break;
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
