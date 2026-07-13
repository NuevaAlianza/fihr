'use strict';
// ── Seguridad ─────────────────────────────────────────────────
document.addEventListener('copy', e => { if (S && S.adminAuth) return; e.preventDefault(); showCopyToast(); });
document.addEventListener('contextmenu', e => { if (S && S.adminAuth) return; e.preventDefault(); showCopyToast(); });

function showCopyToast() {
  var el = document.getElementById('copy-toast');
  el.style.display = 'block';
  clearTimeout(window._cpt);
  window._cpt = setTimeout(() => el.style.display = 'none', 2500);
}

function secureEl(el) {
  if (!el) return;
  el.addEventListener('paste', e => { e.preventDefault(); showCopyToast(); });
  el.addEventListener('drop',  e => e.preventDefault());
  el.addEventListener('contextmenu', e => e.preventDefault());
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, ms) {
  ms = ms || 2500;
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.remove('show'), ms);
}

// ── Timer ─────────────────────────────────────────────────────
function startTimer(min) {
  S.timerSec = min * 60;
  S.timerStart = Date.now();
  var d = document.getElementById('timer-display');
  d.style.display = 'block';
  clearInterval(S.timerInterval);
  S.timerInterval = setInterval(() => {
    var rem = Math.max(0, S.timerSec - Math.floor((Date.now() - S.timerStart) / 1000));
    var m = Math.floor(rem / 60), s = rem % 60;
    d.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (rem <= 300) d.classList.add('warn'); else d.classList.remove('warn');
    if (rem === 0) { clearInterval(S.timerInterval); submitExamen(true); }
  }, 500);
}

function stopTimer() {
  clearInterval(S.timerInterval);
  document.getElementById('timer-display').style.display = 'none';
}

function tiempoUsado() {
  return S.timerStart ? Math.floor((Date.now() - S.timerStart) / 1000) : 0;
}

// ── Utilidades de texto ───────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function normalizeName(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Coincidencia mejorada: requiere mínimo 2 palabras reconocibles
function nameMatch(dbName, inputName) {
  var dbWords = normalizeName(dbName).split(' ').filter(w => w.length > 2);
  var inWords = normalizeName(inputName).split(' ').filter(w => w.length > 2);
  if (!inWords.length) return false;
  var matches = inWords.filter(w => dbWords.some(d => d.startsWith(w) || w.startsWith(d)));
  return matches.length >= Math.min(2, inWords.length);
}

// Genera código único para comprobante de inicio
function generarCodigoInicio(grado, seccion, orden, examenId) {
  var semilla = (grado + '-' + seccion + '-' + orden + '-' + examenId).toUpperCase();
  var hash = 0;
  for (var i = 0; i < semilla.length; i++) {
    hash = ((hash << 5) - hash) + semilla.charCodeAt(i);
    hash |= 0;
  }
  var parte1 = Math.abs(hash).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  var parte2 = Math.abs(new Date().getHours() * 100 + orden).toString(36).toUpperCase().padStart(2, '0').slice(0, 2);
  return parte1 + parte2;
}

// ── Crypto ────────────────────────────────────────────────────
function generarToken() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── PWA Install ───────────────────────────────────────────────
var _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  var banner = document.getElementById('pwa-banner');
  if (banner) banner.classList.remove('hidden');
});

function instalarPWA() {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  _deferredInstall.userChoice.then(() => {
    _deferredInstall = null;
    var banner = document.getElementById('pwa-banner');
    if (banner) banner.classList.add('hidden');
  });
}

// ── Service Worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
