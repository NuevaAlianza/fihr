'use strict';
// ── Acceso por clave a contenido de grado ───────────────────────
// Componente compartido entre index.html (exámenes) y examenes.html
// (portal de clase): sin clave válida asignada por el docente, no
// se puede ver ni exámenes ni material de estudio de ningún grado.
//
// La verificación real ocurre server-side en verificar_acceso_grado
// (SECURITY DEFINER) — este archivo nunca lee ni compara la clave
// del estudiante en el cliente, solo llama al RPC y guarda el
// resultado ya validado en sessionStorage.
var ACCESO_SECCIONES = ['A', 'B', 'C', 'D', 'E'];

function _accesoKey(grado) { return 'sca_acceso_' + grado; }

function getAccesoGrado(grado) {
  try {
    var raw = sessionStorage.getItem(_accesoKey(grado));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function setAccesoGrado(grado, data) {
  try { sessionStorage.setItem(_accesoKey(grado), JSON.stringify(data)); } catch (e) {}
}

// Renderiza el formulario de acceso dentro de `el`. Llama a
// onSuccess({seccion, numero_orden, nombre}) una vez verificada la clave.
function renderGateAcceso(el, grado, onSuccess) {
  var secOpts = ACCESO_SECCIONES.map(function(s) {
    return '<option value="' + s + '">' + s + '</option>';
  }).join('');
  el.innerHTML =
    '<div class="card" style="max-width:420px;margin:24px auto;text-align:center">' +
      '<div style="font-size:32px;margin-bottom:8px">🔒</div>' +
      '<h2 style="margin-bottom:4px">Acceso a ' + esc(grado) + '</h2>' +
      '<p style="color:var(--sub);font-size:13px;margin-bottom:6px">Ingresa tu número de orden, sección y clave personal para continuar.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left">' +
        '<div><label for="ga-orden">Número de orden *</label>' +
        '<input type="number" id="ga-orden" min="1" max="50" placeholder="Ej: 12"></div>' +
        '<div><label for="ga-seccion">Sección *</label>' +
        '<select id="ga-seccion"><option value="">--</option>' + secOpts + '</select></div>' +
      '</div>' +
      '<div style="text-align:left">' +
        '<label for="ga-clave">Clave personal *</label>' +
        '<input type="text" id="ga-clave" maxlength="8" placeholder="——————" autocomplete="off" ' +
          'style="text-transform:uppercase;letter-spacing:4px;font-weight:700;font-size:20px;text-align:center">' +
      '</div>' +
      '<div id="ga-error" style="display:none;margin-top:10px" class="warn-box"></div>' +
      '<button class="btn btn-primary" id="ga-btn" style="width:100%;margin-top:16px">Entrar</button>' +
    '</div>';

  window._gateOnSuccess = onSuccess;
  window._gateGrado = grado;

  var claveEl = document.getElementById('ga-clave');
  if (typeof secureEl === 'function') secureEl(claveEl);
  claveEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') _intentarAcceso(); });
  document.getElementById('ga-btn').addEventListener('click', _intentarAcceso);
}

async function _intentarAcceso() {
  var grado   = window._gateGrado;
  var orden   = parseInt(document.getElementById('ga-orden').value) || 0;
  var seccion = document.getElementById('ga-seccion').value || '';
  var clave   = (document.getElementById('ga-clave').value || '').trim();
  var errEl   = document.getElementById('ga-error');
  var btn     = document.getElementById('ga-btn');

  errEl.style.display = 'none';
  if (!orden || !seccion || !clave) {
    errEl.style.display = 'block';
    errEl.textContent = 'Completa todos los campos.';
    return;
  }

  btn.disabled = true; btn.textContent = 'Verificando...';
  var data, error;
  try {
    ({ data, error } = await sb.rpc('verificar_acceso_grado', {
      p_grado: grado, p_seccion: seccion, p_numero_orden: orden, p_clave: clave
    }));
  } catch (e) { error = e; }
  btn.disabled = false; btn.textContent = 'Entrar';

  if (error || !data || !data.ok) {
    var msgs = {
      no_encontrado: 'No encontramos ese número de orden en ' + grado + ' sección ' + seccion + '.',
      sin_clave_asignada: 'Tu docente aún no te asignó una clave. Consúltale.',
      clave_incorrecta: 'Clave incorrecta. Verifica con tu docente.'
    };
    errEl.style.display = 'block';
    errEl.textContent = (data && msgs[data.error]) || 'Error de conexión. Intenta de nuevo.';
    return;
  }

  var acceso = { seccion: seccion, numero_orden: orden, nombre: data.nombre };
  setAccesoGrado(grado, acceso);
  var cb = window._gateOnSuccess;
  window._gateOnSuccess = null; window._gateGrado = null;
  if (typeof cb === 'function') cb(acceso);
}
