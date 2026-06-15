'use strict';
// ── Selector de grado ─────────────────────────────────────────
function renderSelector() {
  document.getElementById('nav-sub').textContent = '';
  var html = `<div class="selector-wrap">
    <div class="selector-titulo">Selecciona tu grado para ver los exámenes disponibles</div>`;
  GRADOS_CONFIG.forEach(g => {
    var dis = !g.disponible;
    html += `<button ${dis ? 'class="grado-btn grado-unavail"' : 'class="grado-btn"'}
      ${g.disponible ? `onclick="seleccionarGrado('${g.nivel}')"` : ''}
      style="background:linear-gradient(135deg,${g.g1} 0%,${g.g2} 100%)">
      <div class="grado-btn-left">
        <div class="grado-num">${g.nivel}</div>
        <div class="grado-nombre">${g.nombre}</div>
        <div class="grado-etapa">${g.etapa}</div>
      </div>
      <div class="grado-btn-right">${g.svg}</div>
      ${dis ? '<span class="grado-tag">Próximamente</span>' : ''}
    </button>`;
  });
  // Botón a app de clases
  html += `<div style="margin-top:16px;border-top:1px solid #DDE3ED;padding-top:16px">
    <div style="font-size:11px;color:#888;text-align:center;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">¿Buscas otro recurso?</div>
    <button class="clase-link" onclick="window.open('${CLASE_APP_URL}','_blank')">
      <div style="width:44px;height:44px;background:linear-gradient(135deg,#1B5E20,#388E3C);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📖</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:#1B5E20">Plataforma de Clases</div>
        <div style="font-size:12px;color:#888;margin-top:2px">Contenido semanal, actividades y más</div>
      </div>
      <div style="margin-left:auto;color:#1B5E20;font-size:20px">›</div>
    </button>
  </div>`;
  // Banner PWA
  html += `<div id="pwa-banner" class="hidden" style="display:flex;background:var(--az);color:#fff;border-radius:10px;padding:12px 14px;margin-top:12px;align-items:center;gap:10px">
    <span style="flex:1;font-size:13px">📲 Instala la app para acceso rápido sin internet</span>
    <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4)" onclick="instalarPWA()">Instalar</button>
    <button onclick="document.getElementById('pwa-banner').classList.add('hidden')" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:18px">✕</button>
  </div>`;
  html += '</div>';
  document.getElementById('main-content').innerHTML = html;
}

function seleccionarGrado(nivel) {
  S.gradoSeleccionado = nivel;
  S.view = 'inicio';
  render();
}

// ── Inicio (lista de exámenes por grado) ──────────────────────
async function renderInicio() {
  var gc = GRADOS_CONFIG.find(g => g.nivel === S.gradoSeleccionado) || {};
  document.getElementById('nav-sub').textContent = S.gradoSeleccionado || '';
  var { data } = await sb.from('examenes')
    .select('id,titulo,descripcion,grado,periodo,tiempo_minutos,activo,secciones_activas,validar_lista')
    .eq('activo', true).eq('grado', S.gradoSeleccionado)
    .order('created_at', { ascending: false });
  S.examenes = data || [];
  var html = `
  <div style="background:linear-gradient(135deg,${gc.g1||'#1B3A6B'} 0%,${gc.g2||'#0D2B52'} 100%);
    border-radius:14px;padding:16px 20px;margin-bottom:14px;display:flex;align-items:center;gap:14px">
    <div style="flex:1">
      <div style="font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.06em;font-weight:700">Exámenes disponibles</div>
      <div style="font-size:22px;font-weight:700;color:#fff">${gc.nivel||''} — ${gc.nombre||''}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.65);font-style:italic">${gc.etapa||''}</div>
    </div>
    <div style="width:64px;height:56px;opacity:.85">${gc.svg||''}</div>
  </div>
  <div style="margin-bottom:10px">
    <button class="btn btn-outline btn-sm" onclick="S.view='selector';render()">&#8592; Cambiar grado</button>
  </div>
  <div class="card">`;
  if (!S.examenes.length) {
    html += `<div style="text-align:center;padding:40px 0;color:var(--sub)">
      <div style="font-size:40px;margin-bottom:12px">📅</div>
      <div style="font-size:16px;font-weight:700">No hay exámenes activos para ${S.gradoSeleccionado}</div>
      <div style="font-size:13px;margin-top:6px">Consulta con tu docente cuándo estará disponible.</div>
    </div>`;
  } else {
    html += `<h2 style="margin-bottom:14px">Exámenes de ${gc.nombre}</h2>`;
    S.examenes.forEach(ex => {
      var secs = ex.secciones_activas || [];
      var secsLabel = secs.length > 0 ? 'Secciones: ' + secs.join(', ') : 'Todas las secciones';
      html += `<div class="exam-row">
        <div class="exam-info">
          <div class="exam-name">${esc(ex.titulo)}</div>
          <div class="exam-meta">${esc(ex.grado)} · Periodo ${ex.periodo} · ${secsLabel}${ex.tiempo_minutos>0?' · '+ex.tiempo_minutos+' min':''}</div>
          ${ex.validar_lista?'<div style="font-size:11px;color:var(--ve);margin-top:2px">✓ Verificación de lista activa</div>':''}
        </div>
        <button class="btn btn-primary" onclick="iniciarExamen('${ex.id}')">Comenzar</button>
      </div>`;
    });
  }
  html += '</div>';
  document.getElementById('main-content').innerHTML = html;
}

// ── Registro ──────────────────────────────────────────────────
async function iniciarExamen(id) {
  var { data, error } = await sb.from('examenes').select('*').eq('id', id).single();
  if (error || !data || !data.activo) { toast('Examen no disponible'); return; }
  S.examen = data; S.resp = {}; S.ordenItems = {}; S._nombreConfirmado = null; S._claveEstudiante = null;
  S.view = 'registro'; render();
}

function renderRegistro() {
  var ex = S.examen;
  document.getElementById('nav-sub').textContent = ex.titulo;
  var secs = ex.secciones_activas || [];
  var secOpts = (secs.length > 0 ? secs : SECCIONES)
    .map(s => `<option value="${s}">${s}</option>`).join('');

  // Con validar_lista: el estudiante NO escribe su nombre — el sistema lo encuentra
  // Sin validar_lista: campo de nombre manual como antes
  var campoNombre = ex.validar_lista
    ? '' // se inyecta dinámicamente después del lookup
    : `<label for="r-nombre">Nombre completo *</label>
       <div class="secure-area">
         <input type="text" id="r-nombre" maxlength="80" placeholder="Escribe tu nombre completo" autocomplete="off">
         <span class="secure-icon">sin pegar</span>
       </div>`;

  document.getElementById('main-content').innerHTML = `
  <div class="card" style="max-width:500px;margin:0 auto">
    <h2>${esc(ex.titulo)}</h2>
    ${ex.descripcion ? `<div style="color:var(--sub);font-size:14px;margin-bottom:12px">${esc(ex.descripcion)}</div>` : ''}
    ${ex.instrucciones ? `<div class="info-box"><strong>Instrucciones:</strong> ${esc(ex.instrucciones)}</div>` : ''}
    ${ex.validar_lista
      ? '<div class="info-box">Ingresa tu número de orden y sección — el sistema encontrará tu nombre automáticamente.</div>'
      : ''}
    ${secs.length > 0 ? `<div class="info-box" style="background:var(--am2);border-color:#FED7AA;color:var(--am)">📌 Habilitado para sección: <strong>${secs.join(', ')}</strong></div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div>
        <label for="r-orden">Número de orden *</label>
        <input type="number" id="r-orden" min="1" max="50" placeholder="Ej: 12"
          oninput="buscarEstudiante()" onchange="buscarEstudiante()">
      </div>
      <div>
        <label for="r-seccion">Sección *</label>
        <select id="r-seccion" onchange="if(verificarSeccion())buscarEstudiante()">
          <option value="">-- Selecciona --</option>${secOpts}
        </select>
      </div>
    </div>

    <!-- Confirmación de nombre (solo con validar_lista) -->
    <div id="nombre-lookup" style="display:none;margin-top:14px"></div>

    ${campoNombre}

    <div id="reg-error" style="display:none;margin-top:10px" class="warn-box"></div>
    <div class="btn-row">
      <button class="btn btn-outline" onclick="S.view='inicio';render()">Volver</button>
      <button class="btn btn-primary" id="btn-comenzar"
        style="display:${ex.validar_lista ? 'none' : 'inline-flex'}"
        onclick="confirmarRegistro()">Comenzar examen</button>
    </div>
  </div>`;

  if (!ex.validar_lista) secureEl(document.getElementById('r-nombre'));
}

function verificarSeccion() {
  var seccion = document.getElementById('r-seccion')?.value || '';
  var errEl = document.getElementById('reg-error');
  if (!seccion || !S.examen) { if (errEl) errEl.style.display = 'none'; return true; }
  var secs = S.examen.secciones_activas || [];
  if (secs.length > 0 && !secs.includes(seccion)) {
    if (errEl) { errEl.style.display = 'block'; errEl.innerHTML = '⚠️ Este examen no está disponible para la sección <strong>' + seccion + '</strong>. Secciones autorizadas: ' + secs.join(', '); }
    document.getElementById('btn-comenzar').style.display = 'none';
    return false;
  }
  if (errEl) errEl.style.display = 'none';
  return true;
}

// Lookup automático cuando el estudiante ingresa número + sección
var _lookupTimer = null;
function buscarEstudiante() {
  if (!S.examen || !S.examen.validar_lista) return;
  clearTimeout(_lookupTimer);
  _lookupTimer = setTimeout(_doLookup, 400);
}

async function _doLookup() {
  var orden   = parseInt(document.getElementById('r-orden')?.value) || 0;
  var seccion = document.getElementById('r-seccion')?.value || '';
  var grado   = S.gradoSeleccionado;
  var box     = document.getElementById('nombre-lookup');
  var btnCom  = document.getElementById('btn-comenzar');
  var errEl   = document.getElementById('reg-error');
  if (errEl) errEl.style.display = 'none';

  if (!orden || !seccion) {
    box.style.display = 'none';
    btnCom.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  box.innerHTML = `<div style="color:#888;font-size:13px;padding:10px 0">🔍 Buscando...</div>`;
  btnCom.style.display = 'none';

  // Verificar sección autorizada
  var secs = S.examen.secciones_activas || [];
  if (secs.length > 0 && !secs.includes(seccion)) {
    box.innerHTML = `<div class="warn-box">Este examen no está habilitado para la sección ${seccion}. Autorizadas: ${secs.join(', ')}</div>`;
    return;
  }

  var { data: found, error: fErr } = await sb.from('estudiantes_lista')
    .select('id,nombre,numero_orden,clave')
    .eq('grado', grado).eq('seccion', seccion)
    .eq('numero_orden', orden).eq('activo', true)
    .limit(1);
  if (fErr) {
    var fb = await sb.from('estudiantes_lista')
      .select('id,nombre,numero_orden')
      .eq('grado', grado).eq('seccion', seccion)
      .eq('numero_orden', orden).eq('activo', true)
      .limit(1);
    found = fb.data;
  }
  S._claveEstudiante = (found && found[0]?.clave) || null;

  if (!found || !found.length) {
    box.innerHTML = `<div class="warn-box">El número <strong>${orden}</strong> no está en la lista de ${grado} sección ${seccion}.<br><small>Verifica tu número de orden o consulta a tu docente.</small></div>`;
    return;
  }

  var nombre = found[0].nombre;
  // Mostrar confirmación
  box.innerHTML = `
    <div style="border:2px solid #1B3A6B;border-radius:10px;padding:16px;background:#EEF5FF;text-align:center">
      <div style="font-size:13px;color:#555;margin-bottom:8px">¿Eres tú?</div>
      <div style="font-size:18px;font-weight:700;color:#1B3A6B;margin-bottom:14px">${esc(nombre)}</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn btn-primary" style="min-width:100px"
          onclick="confirmarNombre('${esc(nombre).replace(/'/g,"\\'")}')">✓ Sí, soy yo</button>
        <button class="btn btn-outline" style="min-width:100px"
          onclick="rechazarNombre()">✗ No soy yo</button>
      </div>
    </div>`;
}

function confirmarNombre(nombre) {
  S._nombreConfirmado = nombre;
  var box = document.getElementById('nombre-lookup');
  if (S._claveEstudiante) {
    box.innerHTML = `
      <div style="border:2px solid #1B3A6B;border-radius:10px;padding:16px;background:#EEF5FF">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div>
            <div style="font-size:13px;color:#555">Identificado como:</div>
            <div style="font-size:15px;font-weight:700;color:#1B3A6B">${esc(nombre)}</div>
          </div>
          <button class="btn btn-xs btn-gray" style="margin-left:auto" onclick="rehacerLookup()">Cambiar</button>
        </div>
        <label style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Ingresa tu clave personal</label>
        <input type="text" id="clave-input" maxlength="8" placeholder="——————"
          style="text-transform:uppercase;letter-spacing:4px;font-weight:700;font-size:20px;text-align:center;margin-top:0"
          autocomplete="off" oninput="verificarClave()">
        <div id="clave-error" style="display:none;color:#B71C1C;font-size:12px;margin-top:6px"></div>
      </div>`;
    var ci = document.getElementById('clave-input');
    if (ci) { secureEl(ci); ci.focus(); }
  } else {
    box.innerHTML = `
      <div style="border:2px solid #1B5E20;border-radius:10px;padding:12px 16px;background:#E8F5E9;display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">✓</span>
        <div>
          <div style="font-size:13px;color:#555">Identificado como:</div>
          <div style="font-size:15px;font-weight:700;color:#1B5E20">${esc(nombre)}</div>
        </div>
        <button class="btn btn-xs btn-gray" style="margin-left:auto" onclick="rehacerLookup()">Cambiar</button>
      </div>`;
    document.getElementById('btn-comenzar').style.display = 'inline-flex';
  }
}

function verificarClave() {
  var input = document.getElementById('clave-input');
  var errEl = document.getElementById('clave-error');
  if (!input || !errEl) return;
  var typed = input.value.trim().toUpperCase();
  var expected = (S._claveEstudiante || '').trim().toUpperCase();
  if (!typed) {
    errEl.style.display = 'none'; input.style.borderColor = '';
    document.getElementById('btn-comenzar').style.display = 'none'; return;
  }
  if (typed === expected) {
    errEl.style.display = 'none'; input.style.borderColor = '#1B5E20';
    document.getElementById('btn-comenzar').style.display = 'inline-flex';
  } else if (typed.length >= expected.length) {
    errEl.style.display = 'block'; errEl.textContent = 'Clave incorrecta. Verifica con tu docente.';
    input.style.borderColor = '#B71C1C';
    document.getElementById('btn-comenzar').style.display = 'none';
  } else {
    errEl.style.display = 'none'; input.style.borderColor = '';
    document.getElementById('btn-comenzar').style.display = 'none';
  }
}

function rechazarNombre() {
  S._nombreConfirmado = null; S._claveEstudiante = null;
  var box = document.getElementById('nombre-lookup');
  box.innerHTML = `<div class="warn-box">Verifica tu número de orden y sección, o avísale a tu docente.</div>`;
  document.getElementById('btn-comenzar').style.display = 'none';
}

function rehacerLookup() {
  S._nombreConfirmado = null; S._claveEstudiante = null;
  document.getElementById('r-orden').value = '';
  document.getElementById('r-seccion').value = '';
  document.getElementById('nombre-lookup').style.display = 'none';
  document.getElementById('btn-comenzar').style.display = 'none';
  document.getElementById('r-orden').focus();
}

async function confirmarRegistro() {
  var orden   = parseInt(document.getElementById('r-orden')?.value) || 0;
  var seccion = document.getElementById('r-seccion')?.value || '';
  var grado   = S.gradoSeleccionado;
  var errEl   = document.getElementById('reg-error');
  var btn     = document.getElementById('btn-comenzar');

  // Nombre: desde lookup confirmado (validar_lista) o campo manual
  var nombre = S.examen.validar_lista
    ? (S._nombreConfirmado || '')
    : (document.getElementById('r-nombre')?.value.trim() || '');

  function showErr(msg) { errEl.style.display = 'block'; errEl.innerHTML = msg; }
  errEl.style.display = 'none';

  if (!nombre || !seccion || orden < 1) {
    showErr('Completa todos los campos correctamente.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Verificando...';

  // Sección autorizada
  var secs = S.examen.secciones_activas || [];
  if (secs.length > 0 && !secs.includes(seccion)) {
    showErr('Sección no autorizada: ' + secs.join(', '));
    btn.disabled = false; btn.textContent = 'Comenzar examen'; return;
  }

  // Validar contra lista (solo si no viene de lookup confirmado)
  if (S.examen.validar_lista && !S._nombreConfirmado) {
    showErr('Confirma tu identidad primero ingresando tu número y sección.');
    btn.disabled = false; btn.textContent = 'Comenzar examen'; return;
  }

  // Si NO tiene lista, validar nombre manual con nameMatch
  if (!S.examen.validar_lista) {
    var { data: estFound } = await sb.from('estudiantes_lista')
      .select('id,nombre').eq('grado', grado).eq('seccion', seccion)
      .eq('numero_orden', orden).eq('activo', true);
    if (estFound && estFound.length) {
      var match = estFound.find(e => nameMatch(e.nombre, nombre));
      if (!match) {
        showErr('El nombre no coincide con el número ' + orden + '.');
        btn.disabled = false; btn.textContent = 'Comenzar examen'; return;
      }
    }
  }

  // Envío previo — mostrar nombre registrado si existe
  var { data: dup } = await sb.from('respuestas_examenes').select('id,nombre')
    .eq('examen_id', S.examen.id).eq('numero_orden', orden)
    .eq('seccion', seccion).eq('grado', grado).limit(1);
  if (dup && dup.length) {
    var nomDup = dup[0].nombre ? ' (registrado como: <strong>' + esc(dup[0].nombre) + '</strong>)' : '';
    showErr('Ya existe un envío para el número ' + orden + ' en sección ' + seccion + nomDup + '. Solo se permite un envío.');
    btn.disabled = false; btn.textContent = 'Comenzar examen'; return;
  }

  // Capa 1 — registrar inicio
  btn.textContent = 'Registrando...';
  var codigo = generarCodigoInicio(grado, seccion, orden, S.examen.id);
  var { data: inicio } = await sb.rpc('public_registrar_inicio', {
    p_examen_id: S.examen.id, p_nombre: nombre,
    p_numero_orden: orden, p_grado: grado, p_seccion: seccion, p_codigo: codigo
  });
  if (inicio && !inicio.ok) {
    showErr('⚠️ Ya abriste este examen el <strong>' + inicio.iniciado_at + '</strong>.<br>' +
      'Tu código fue: <strong style="font-family:monospace;font-size:16px;letter-spacing:2px">' + inicio.codigo + '</strong><br><br>' +
      'Solo se permite un intento. Si tuviste un problema técnico, muéstrale este código a tu docente.');
    btn.disabled = false; btn.textContent = 'Comenzar examen'; return;
  }

  S._nombreConfirmado = null; // limpiar
  S.est = { nombre, orden, grado, seccion, codigo: inicio ? inicio.codigo : codigo };
  mostrarComprobante(nombre, grado, seccion, orden, S.est.codigo, S.examen.titulo);
}

function mostrarComprobante(nombre, grado, seccion, orden, codigo, tituloExamen) {
  document.getElementById('nav-sub').textContent = nombre + ' · ' + seccion;
  document.getElementById('main-content').innerHTML = `
  <div style="max-width:480px;margin:0 auto">
    <div class="card" style="text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📋</div>
      <div style="font-size:17px;font-weight:700;color:#1B3A6B;margin-bottom:4px">Tu código de inicio</div>
      <div style="font-size:13px;color:#888;margin-bottom:20px">${esc(tituloExamen)}</div>
      <div style="background:#F0F4F8;border-radius:10px;padding:18px;margin-bottom:20px">
        <div style="font-size:38px;font-weight:700;letter-spacing:6px;color:#1B3A6B;font-family:monospace">${codigo}</div>
        <div style="font-size:12px;color:#888;margin-top:8px">${esc(grado)} · Sección ${esc(seccion)} · Orden ${orden}</div>
      </div>
      <div class="warn-box" style="text-align:left;margin-bottom:20px">
        <strong>⚠️ Anota este código</strong><br>
        Escríbelo en tu cuaderno o toma una foto. Tu docente lo usará para verificar que realmente iniciaste en caso de algún problema.
      </div>
      <div style="font-size:13px;color:#555;margin-bottom:20px">Nombre registrado: <strong>${esc(nombre)}</strong></div>
      <button class="btn btn-primary" style="width:100%;font-size:15px;padding:13px" onclick="entrarAlExamen()">
        Entendido — Comenzar examen →
      </button>
    </div>
    <div style="text-align:center;font-size:12px;color:#AAA;margin-top:8px">Una vez que presiones el botón, comenzará el examen.</div>
  </div>`;
}

async function entrarAlExamen() {
  S.cambiosPestana = 0;
  S._sesionToken = generarToken();
  // Verificar sesión única — si hay sesión activa con otro token, bloquear
  try {
    var { data: sesData } = await sb.rpc('public_iniciar_sesion', {
      p_examen_id: S.examen.id,
      p_numero_orden: S.est.numero_orden,
      p_seccion: S.est.seccion,
      p_token: S._sesionToken
    });
    if (sesData && sesData.ok === false) {
      document.getElementById('app').innerHTML = `
        <div style="max-width:400px;margin:80px auto;padding:24px;background:#fff;border-radius:12px;border:1px solid var(--brd);text-align:center">
          <div style="font-size:36px;margin-bottom:12px">🔒</div>
          <div style="font-weight:700;font-size:16px;margin-bottom:8px">Sesión activa detectada</div>
          <div style="font-size:14px;color:#555;margin-bottom:20px">Ya existe una sesión activa para este estudiante. Si eres tú, espera 2 minutos e intenta de nuevo.</div>
          <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
        </div>`;
      return;
    }
  } catch(e) { /* RPC no disponible — continuar sin sesión única */ }
  document.addEventListener('visibilitychange', _onVisibilityChange);
  S.view = 'examen'; S.currentQ = 0;
  (S.examen.preguntas || []).forEach((q, i) => { if (q.tipo === 'ordenar') { S.ordenItems[i] = [...q.items]; S.resp[i] = [...q.items]; } });
  render();
  if (S.examen.tiempo_minutos > 0) startTimer(S.examen.tiempo_minutos);
}

function _onVisibilityChange() {
  if (document.hidden) S.cambiosPestana = (S.cambiosPestana || 0) + 1;
}

// ── Examen ────────────────────────────────────────────────────
function renderExamen() {
  var qs = S.examen.preguntas || [];
  if (S.currentQ === undefined) S.currentQ = 0;
  var qi = Math.min(S.currentQ, qs.length - 1);
  var evalQs = qs.filter(q => q.tipo !== 'lectura');
  var resp_count = Object.keys(S.resp).filter(k => qs[k] && qs[k].tipo !== 'lectura').length;
  document.getElementById('nav-sub').textContent = S.est.nombre + ' · ' + S.est.seccion;
  var pct = evalQs.length > 0 ? Math.round(resp_count / evalQs.length * 100) : 0;
  var navDots = qs.map((q, i) => {
    var isRead = q.tipo === 'lectura';
    var ans = S.resp[i] !== undefined && S.resp[i] !== null && S.resp[i] !== '';
    var active = i === qi;
    var bg = active ? '#1B3A6B' : (isRead ? '#93C5FD' : (ans ? '#1B5E20' : '#ccc'));
    return `<div onclick="goToQ(${i})" title="${isRead?'Lectura':'Pregunta '+(i+1)}" style="width:${active?'28px':'10px'};height:10px;border-radius:5px;background:${bg};cursor:pointer;transition:.2s;flex-shrink:0"></div>`;
  }).join('');
  var html = `
  <div style="background:#fff;border:1px solid var(--brd);border-radius:10px;padding:12px 14px;margin-bottom:12px;position:sticky;top:52px;z-index:10">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font-size:13px;color:var(--sub)">Pregunta <strong>${qi+1}</strong> de <strong>${qs.length}</strong></span>
      <span style="font-size:13px;color:var(--sub)">${resp_count} respondidas</span>
    </div>
    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">${navDots}</div>
    <div style="display:flex;gap:2px;margin-top:6px">
      <div style="width:${pct}%;height:4px;background:#1B3A6B;border-radius:2px 0 0 2px"></div>
      <div style="flex:1;height:4px;background:#e0e0e0;border-radius:0 2px 2px 0"></div>
    </div>
  </div>`;
  html += renderPregunta(qs[qi], qi);
  var isLast = qi === qs.length - 1;
  var esLectura = qs[qi] && qs[qi].tipo === 'lectura';
  var answered = S.resp[qi] !== undefined && S.resp[qi] !== null && S.resp[qi] !== '';
  var nextLabel = esLectura ? 'Continuar &#8594;' : (answered ? 'Siguiente &#8594;' : 'Omitir &#8594;');
  html += `<div style="display:flex;gap:10px;margin-top:4px">
    ${qi > 0 ? `<button class="btn btn-outline" style="flex:1" onclick="goToQ(${qi-1})">&#8592; Anterior</button>` : '<div style="flex:1"></div>'}
    ${!isLast
      ? `<button class="btn btn-primary" style="flex:2" onclick="goToQ(${qi+1})">${nextLabel}</button>`
      : `<button class="btn btn-success" style="flex:2;font-size:15px" onclick="submitExamen(false)">Enviar examen</button>`}
  </div>
  <div style="font-size:12px;color:var(--sub);text-align:center;margin-top:8px">${evalQs.length-resp_count>0?evalQs.length-resp_count+' sin responder':'Todas respondidas'}</div>`;
  document.getElementById('main-content').innerHTML = html;
  document.querySelectorAll('.secure-txt').forEach(el => secureEl(el));
  initDrag();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToQ(i) {
  document.querySelectorAll('.secure-txt').forEach(el => {
    if (el.id && el.id.startsWith('txt_')) { var qi = parseInt(el.id.split('_')[1]); if (el.value.trim()) S.resp[qi] = el.value.trim(); }
    if (el.id && el.id.startsWith('bl_'))  { var p = el.id.split('_'); var qi = parseInt(p[1]), bi = parseInt(p[2]); if (!S.resp[qi]) S.resp[qi] = {}; S.resp[qi][bi] = el.value.trim(); }
  });
  var qs = S.examen.preguntas || [];
  S.currentQ = Math.max(0, Math.min(i, qs.length - 1));
  renderExamen();
}

function renderPregunta(q, i) {
  // Tipo lectura: bloque visual no evaluado
  if (q.tipo === 'lectura') {
    return `<div class="lectura-card">
      <div class="lectura-header">
        <span style="font-size:18px">📖</span>
        <span class="lectura-label">Lectura</span>
        ${q.texto ? `<span class="lectura-titulo">${esc(q.texto)}</span>` : ''}
      </div>
      <div class="lectura-body">${esc(q.contenido||'')}</div>
    </div>`;
  }

  var resp = S.resp[i];
  var answered = resp !== undefined && resp !== null && resp !== '';
  var inner = '';
  switch (q.tipo) {
    case 'multiple':
      var L = ['A','B','C','D'];
      inner = '<div class="op-list">' + (q.opciones||[]).map((op, oi) =>
        `<button class="op-btn${resp===oi?' selected':''}" onclick="setR(${i},${oi});renderExamen()">
          <div class="op-letra">${resp===oi?'✓':L[oi]}</div>
          <span>${esc(op)}</span>
        </button>`).join('') + '</div>';
      break;
    case 'texto':
      inner = `<div class="secure-area">
        <textarea class="secure-txt" id="txt_${i}" rows="4" placeholder="Escribe tu respuesta aquí..."
          oninput="setR(${i},this.value)">${esc(resp||'')}</textarea>
        <span class="secure-icon">sin pegar</span></div>`;
      break;
    case 'vf':
      inner = `<div class="vf-row">
        <button class="vf-btn${resp==='V'?' sel-v':''}" onclick="setR(${i},'V');renderExamen()">Verdadero</button>
        <button class="vf-btn${resp==='F'?' sel-f':''}" onclick="setR(${i},'F');renderExamen()">Falso</button>
      </div>`;
      break;
    case 'completar':
      var txt = esc(q.texto||''); var bi = 0;
      txt = txt.replace(/___/g, () => {
        var b = bi++; var v = (resp && resp[b]) || '';
        return `<input type="text" class="blank-input secure-txt" id="bl_${i}_${b}" value="${esc(v)}" placeholder="?" oninput="setRBlank(${i},${b},this.value)" maxlength="60">`;
      });
      inner = `<div class="completar-txt">${txt}</div>`;
      break;
    case 'ordenar':
      var items = S.ordenItems[i] || q.items || [];
      inner = `<div class="orden-list" id="ord_${i}">` + items.map((it, ii) =>
        `<div class="orden-item" draggable="true" data-q="${i}" data-ii="${ii}">
          <span class="orden-handle">☰</span>
          <div class="orden-pos">${ii+1}</div>
          <span>${esc(it)}</span>
        </div>`).join('') + '</div>';
      break;
    case 'escala':
      var lbs = q.etiquetas || ['1','2','3','4','5'];
      inner = `<div class="escala-row">` + [1,2,3,4,5].map(n =>
        `<button class="escala-btn${resp===n?' selected':''}" onclick="setR(${i},${n});renderExamen()">
          <div class="escala-num">${n}</div>
          <div class="escala-lbl">${esc(lbs[n-1]||n)}</div>
        </button>`).join('') + '</div>';
      break;
  }
  return `<div class="pregunta-card" style="border-color:${answered?'var(--ve)':'var(--brd)'}">
    <div class="pregunta-header">
      <span class="pregunta-num">${i+1}</span>
      <span class="pregunta-txt">${esc(q.texto||'')}</span>
      ${q.puntos ? `<span class="pts-badge">${q.puntos} pts</span>` : ''}
    </div>${inner}</div>`;
}

function setR(qi, v) { S.resp[qi] = v; }
function setRBlank(qi, bi, v) { if (!S.resp[qi]) S.resp[qi] = {}; S.resp[qi][bi] = v; }

function initDrag() {
  document.querySelectorAll('.orden-list').forEach(list => {
    var qi = parseInt(list.id.split('_')[1]);
    var src = null;
    list.querySelectorAll('.orden-item').forEach(item => {
      item.addEventListener('dragstart', e => { src = item; item.classList.add('dragging'); });
      item.addEventListener('dragend',   () => item.classList.remove('dragging'));
      item.addEventListener('dragover',  e => { e.preventDefault(); item.classList.add('dragover'); });
      item.addEventListener('dragleave', () => item.classList.remove('dragover'));
      item.addEventListener('drop', e => {
        e.preventDefault(); item.classList.remove('dragover');
        if (!src || src === item) return;
        var items = Array.from(list.querySelectorAll('.orden-item'));
        var fi = items.indexOf(src), ti = items.indexOf(item);
        var arr = [...S.ordenItems[qi]];
        var [mv] = arr.splice(fi, 1); arr.splice(ti, 0, mv);
        S.ordenItems[qi] = arr; S.resp[qi] = [...arr];
        list.innerHTML = arr.map((it, ii) =>
          `<div class="orden-item" style="border-color:var(--ve)" draggable="true" data-q="${qi}" data-ii="${ii}">
            <span class="orden-handle">☰</span>
            <div class="orden-pos">${ii+1}</div><span>${esc(it)}</span>
          </div>`).join('');
        initDrag();
      });
    });
  });
}

function normText(s) {
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim();
}

function calcularNota(examen, respuestas) {
  var qs = examen.preguntas || [];
  var detalle = []; var puntos_auto = 0, puntos_texto_max = 0, puntos_maximo = 0;
  qs.forEach((q, i) => {
    var pts = q.puntos || 0; puntos_maximo += pts;
    var resp = respuestas[i];
    var item = { qi:i, tipo:q.tipo, pts_max:pts, pts:0, auto:false, pendiente:false };
    switch (q.tipo) {
      case 'multiple':
        item.auto = true;
        var corrIdx = ['A','B','C','D'].indexOf(q.correcta);
        if (resp === corrIdx) item.pts = pts;
        break;
      case 'vf':
        item.auto = true;
        if (String(resp) === String(q.correcta)) item.pts = pts;
        break;
      case 'ordenar':
        item.auto = true;
        var correctOrder = q.items || []; var studentOrder = Array.isArray(resp) ? resp : [];
        if (!studentOrder.length) break;
        var matches = 0;
        correctOrder.forEach((it, ci) => { if (normText(studentOrder[ci]) === normText(it)) matches++; });
        item.pts = matches === correctOrder.length ? pts : matches >= Math.ceil(correctOrder.length/2) ? Math.round(pts*matches/correctOrder.length) : 0;
        item.detalle = matches+'/'+correctOrder.length+' en orden correcto';
        break;
      case 'completar':
        item.auto = true;
        var correctBlanks = q.respuestas || [];
        if (!correctBlanks.length) { item.pts = 0; break; }
        var studentBlanks = (resp && typeof resp==='object') ? resp : {};
        var blancoCorrectos = 0;
        correctBlanks.forEach((correct, bi) => {
          var given = normText(studentBlanks[bi]||''), cn = normText(correct);
          if (given===cn||(given.length>3&&cn.includes(given))||(cn.length>3&&given.includes(cn.substring(0,Math.ceil(cn.length*0.6))))) blancoCorrectos++;
        });
        item.pts = Math.round(pts*blancoCorrectos/correctBlanks.length);
        break;
      case 'lectura':
        // Bloque informativo, no evaluado
        item.auto = true; item.pts = 0; puntos_maximo -= pts; break;
      case 'texto':
        item.pendiente = true; puntos_texto_max += pts; break;
      case 'escala':
        item.auto = true;
        item.pts = (resp !== undefined && resp !== null && resp !== '') ? pts : 0;
        item.detalle = 'participacion';
        break;
    }
    if (item.auto) puntos_auto += item.pts;
    detalle.push(item);
  });
  return { puntos_auto, puntos_texto_max, puntos_maximo, detalle };
}

async function submitExamen(auto) {
  if (!auto) {
    var qs = S.examen.preguntas || [];
    var evalQs2 = qs.filter(q => q.tipo !== 'lectura');
    var respCount2 = Object.keys(S.resp).filter(k => qs[k] && qs[k].tipo !== 'lectura').length;
    var sin = evalQs2.length - respCount2;
    if (sin > 0 && !confirm('Tienes ' + sin + ' pregunta(s) sin responder. ¿Enviar de todas formas?')) return;
  }
  stopTimer();
  document.querySelectorAll('.secure-txt').forEach(el => {
    if (el.id && el.id.startsWith('txt_')) { var qi = parseInt(el.id.split('_')[1]); if (el.value.trim()) S.resp[qi] = el.value.trim(); }
    if (el.id && el.id.startsWith('bl_'))  { var p = el.id.split('_'); var qi = parseInt(p[1]), bi = parseInt(p[2]); if (!S.resp[qi]) S.resp[qi] = {}; S.resp[qi][bi] = el.value.trim(); }
  });
  var { puntos_auto, puntos_texto_max, puntos_maximo, detalle } = calcularNota(S.examen, S.resp);
  var tiene_texto = puntos_texto_max > 0;
  var { data: rpcData, error } = await sb.rpc('public_enviar_respuesta', {
    p_examen_id: S.examen.id, p_nombre: S.est.nombre,
    p_numero_orden: parseInt(S.est.orden)||0, p_grado: S.est.grado, p_seccion: S.est.seccion,
    p_respuestas: S.resp, p_tiempo_seg: tiempoUsado(),
    p_puntos_auto: puntos_auto, p_puntos_maximo: puntos_maximo,
    p_detalle_notas: detalle, p_tiene_texto: tiene_texto
  });
  if (!error && rpcData?.error) { toast('No se pudo enviar: ' + rpcData.error, 4000); return; }
  if (error) { toast('Error al guardar: ' + error.message, 4000); return; }
  document.removeEventListener('visibilitychange', _onVisibilityChange);
  if (S._sesionToken) {
    sb.rpc('public_finalizar_sesion', { p_token: S._sesionToken }).catch(function() {});
    S._sesionToken = null;
  }
  if (S.cambiosPestana > 0) {
    var respId = rpcData?.id || null;
    sb.rpc('public_registrar_cambios_pestana', { p_respuesta_id: respId, p_cambios: S.cambiosPestana }).catch(function() {});
  }
  S.view = 'enviado'; render();
}

function renderEnviado() {
  document.getElementById('main-content').innerHTML = `
  <div class="card enviado-box">
    <div class="enviado-icon">✓</div>
    <div class="enviado-title">Examen enviado</div>
    <p style="color:var(--sub);margin-bottom:16px">Tus respuestas fueron guardadas, ${esc(S.est.nombre)}.</p>
    <div class="success-box" style="display:inline-block;text-align:left">
      <div><strong>Examen:</strong> ${esc(S.examen.titulo)}</div>
      <div><strong>Grado/Sección:</strong> ${esc(S.est.grado)} — ${esc(S.est.seccion)} · Orden: ${S.est.orden}</div>
      ${S.est.codigo ? `<div style="margin-top:6px;font-size:12px;color:#555">Código de inicio: <span style="font-family:monospace;font-weight:700">${S.est.codigo}</span></div>` : ''}
    </div>
    <div style="margin-top:20px">
      <button class="btn btn-outline" onclick="S.view='inicio';render()">Ver más exámenes</button>
    </div>
  </div>`;
}
