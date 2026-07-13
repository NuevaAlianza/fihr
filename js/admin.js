'use strict';
// ── Login ─────────────────────────────────────────────────────
function showAdminLogin() {
  if (S.adminAuth) { S.view = 'admin'; render(); return; }
  S.view = 'admin-login'; render();
}

function renderAdminLogin() {
  document.getElementById('main-content').innerHTML = `
  <div class="card" style="max-width:360px;margin:40px auto">
    <h2>Acceso administrador</h2>
    <label for="pin-in">PIN</label>
    <input type="password" id="pin-in" maxlength="10" placeholder="Ingresa el PIN" onkeydown="if(event.key==='Enter')checkPin()">
    <div class="btn-row">
      <button class="btn btn-outline" onclick="S.view='selector';render()">Cancelar</button>
      <button class="btn btn-primary" onclick="checkPin()">Ingresar</button>
    </div>
  </div>`;
}

async function checkPin() {
  var pin = document.getElementById('pin-in').value;
  var btn = document.querySelector('#main-content .btn-primary');
  if (btn) btn.disabled = true;
  var { data, error } = await sb.rpc('admin_login', { p_pin: pin });
  if (btn) btn.disabled = false;
  if (error) { toast('Error de conexión: ' + error.message, 4000); return; }
  if (data && data.ok) {
    S.adminAuth = true; S.pinHash = data.token;
    document.getElementById('btn-admin').textContent = 'Salir';
    document.getElementById('btn-admin').onclick = adminLogout;
    S.view = 'admin'; render();
  } else if (data && data.error === 'bloqueado') {
    toast('Demasiados intentos. Espera ' + (data.segundos || 30) + ' segundos.', 3500);
  } else {
    var restantes = data && data.intentos_restantes != null ? data.intentos_restantes : null;
    toast('PIN incorrecto' + (restantes != null ? ' — ' + restantes + ' intento(s) restante(s)' : ''));
  }
}

async function adminLogout() {
  if (S.pinHash) { await rpcAdmin('admin_logout', {}); }
  S.adminAuth = false; S.pinHash = null; S.view = 'selector';
  document.getElementById('btn-admin').textContent = 'Admin';
  document.getElementById('btn-admin').onclick = showAdminLogin;
  render();
}

// ── Panel admin ───────────────────────────────────────────────
async function renderAdmin() {
  var tabContent = '';
  if (S.adminTab === 'examenes')  tabContent = await buildExamenesTab();
  else if (S.adminTab === 'lista') tabContent = await buildListaTab();
  else if (S.adminTab === 'historial') tabContent = await buildHistorialTab();
  document.getElementById('main-content').innerHTML = `
  <div class="card" style="padding-bottom:0">
    <h2 style="margin:0 0 0 0">Panel de administración</h2>
    <div class="admin-tabs">
      <div class="admin-tab${S.adminTab==='examenes'?' active':''}" onclick="S.adminTab='examenes';renderAdmin()">Exámenes</div>
      <div class="admin-tab${S.adminTab==='lista'?' active':''}" onclick="S.adminTab='lista';renderAdmin()">Lista de estudiantes</div>
      <div class="admin-tab${S.adminTab==='historial'?' active':''}" onclick="S.adminTab='historial';renderAdmin()">Historial archivado</div>
    </div>
  </div>
  <div id="tab-content">${tabContent}</div>`;
}

async function buildExamenesTab() {
  var { data } = await sb.from('examenes')
    .select('id,titulo,grado,periodo,activo,tiempo_minutos,secciones_activas,validar_lista,created_at')
    .order('grado').order('created_at', { ascending: false });
  S.examenes = data || [];
  var porGrado = {};
  S.examenes.forEach(ex => { if (!porGrado[ex.grado]) porGrado[ex.grado] = []; porGrado[ex.grado].push(ex); });
  var html = `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <span style="font-size:14px;color:var(--sub)">${S.examenes.length} examen(es)</span>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn btn-gray btn-sm" onclick="mostrarEstructuraJSON()">{ } Estructura JSON</button>
        <button class="btn btn-gray btn-sm" onclick="mostrarImportJSON()">↑ Importar JSON</button>
        <button class="btn btn-primary btn-sm" onclick="S.adminExamen=null;S.qBuilders=[];S.view='admin-crear';render()">+ Nuevo examen</button>
      </div>
    </div>
    <div id="import-json-area" style="display:none;background:#F0F4F8;border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:var(--sub);margin-bottom:8px">Importar examen desde JSON</div>
      <textarea id="json-input" rows="5" style="font-size:12px;font-family:monospace" placeholder="{}"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('import-json-area').style.display='none'">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="procesarImportJSON()">Importar examen</button>
      </div>
    </div>`;
  if (!S.examenes.length) { html += '<p style="color:var(--sub);text-align:center;padding:24px">Sin exámenes todavía.</p>'; }
  else {
    GRADOS_CONFIG.filter(g => g.disponible).map(g => g.nivel).forEach(grado => {
      var exs = porGrado[grado] || [];
      if (!exs.length) return;
      var gc = GRADOS_CONFIG.find(g => g.nivel === grado) || {};
      html += `<div style="margin-bottom:6px;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;color:#fff;background:linear-gradient(135deg,${gc.g1||'#555'} 0%,${gc.g2||'#333'} 100%)">${grado} — ${gc.nombre||''}</div>`;
      exs.forEach(ex => {
        var secs = ex.secciones_activas || [];
        var secsLabel = secs.length > 0 ? 'Sec: ' + secs.join(',') : 'Todas las secciones';
        html += `<div class="exam-row">
          <div class="exam-info">
            <div class="exam-name">${esc(ex.titulo)}</div>
            <div class="exam-meta">${esc(ex.grado)} · P${ex.periodo} · ${secsLabel}${ex.tiempo_minutos>0?' · '+ex.tiempo_minutos+'min':''}</div>
            <div style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap">
              <span class="badge ${ex.activo?'badge-on':'badge-off'}">${ex.activo?'Activo':'Cerrado'}</span>
              ${ex.validar_lista?'<span class="badge badge-am">Verifica lista</span>':'<span class="badge badge-gray" style="opacity:.6">Sin verificar lista</span>'}
            </div>
          </div>
          <button class="toggle-btn ${ex.activo?'on':'off'}" onclick="toggleActivo('${ex.id}',${ex.activo})" title="Abrir/Cerrar"><div class="toggle-knob"></div></button>
          <button class="btn btn-outline btn-sm" onclick="verRespuestas('${ex.id}')">Respuestas</button>
          <button class="btn btn-gray btn-sm" onclick="editarExamen('${ex.id}')">Editar</button>
          <button class="btn btn-xs" style="background:var(--ro2);color:var(--ro);border:none;font-weight:700;cursor:pointer;border-radius:6px" onclick="eliminarExamen('${ex.id}','${esc(ex.titulo)}')">✕</button>
        </div>`;
      });
    });
  }
  html += '</div>'; return html;
}

async function toggleActivo(id, actual) {
  var { error } = await rpcAdmin('admin_toggle_examen', { p_id: id, p_activo: !actual });
  if (error) { toast('Error: ' + error.message, 4000); return; }
  toast(actual ? 'Examen cerrado' : 'Examen abierto');
  S.adminTab = 'examenes'; renderAdmin();
}

async function eliminarExamen(id, titulo) {
  if (!confirm('Eliminar "' + titulo + '" y TODAS sus respuestas? Esta acción no se puede deshacer.')) return;
  var { error } = await rpcAdmin('admin_delete_examen', { p_id: id });
  if (error) { toast('Error: ' + error.message, 4000); return; }
  toast('Eliminado'); renderAdmin();
}

async function editarExamen(id) {
  var { data } = await sb.from('examenes').select('*').eq('id', id).single();
  S.adminExamen = data; S.qBuilders = [...(data.preguntas || [])];
  S.view = 'admin-crear'; render();
}

async function buildListaTab() {
  var { data } = await sb.from('estudiantes_lista').select('*').order('grado').order('seccion').order('numero_orden');
  S.listaEst = data || [];
  var grados = ['2do','4to','5to','6to'], secs = ['A','B','C','D'];
  var html = `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <span style="font-size:14px;color:var(--sub)">${S.listaEst.length} estudiante(s)</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="mostrarImportarLista()">Importar CSV</button>
        <button class="btn btn-primary btn-sm" onclick="agregarEstudiante()">+ Agregar uno</button>
      </div>
    </div>
    <div id="import-area" style="display:none" class="form-sec">
      <div class="form-sec-title">Importar lista desde CSV</div>
      <div class="info-box">Formato: <strong>grado,seccion,numero_orden,nombre</strong></div>
      <textarea id="csv-input" rows="6" placeholder="2do,A,1,Maria Garcia Lopez"></textarea>
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('import-area').style.display='none'">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="procesarCSV()">Importar</button>
      </div>
    </div>
    <div id="add-est-area" style="display:none" class="form-sec">
      <div class="form-sec-title">Agregar estudiante</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div><label>Grado</label><select id="ae-grado">${grados.map(g=>`<option>${g}</option>`).join('')}</select></div>
        <div><label>Sección</label><select id="ae-sec">${secs.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div><label>Número</label><input type="number" id="ae-num" min="1" max="50"></div>
      </div>
      <label for="ae-nombre">Nombre completo</label>
      <input type="text" id="ae-nombre" placeholder="Nombre Apellido Apellido" maxlength="80">
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('add-est-area').style.display='none'">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="guardarEstudiante()">Guardar</button>
      </div>
    </div>`;
  var grupos = {};
  S.listaEst.forEach(e => { var k = e.grado+'-'+e.seccion; if (!grupos[k]) grupos[k] = {grado:e.grado,seccion:e.seccion,items:[]}; grupos[k].items.push(e); });
  if (!Object.keys(grupos).length) { html += '<p style="color:var(--sub);text-align:center;padding:20px">Sin estudiantes registrados.</p>'; }
  else {
    Object.values(grupos).forEach(g => {
      html += `<div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px">
          <span style="font-weight:700;font-size:13px;color:var(--az)">${g.grado} — Sección ${g.seccion}</span>
          <span class="badge badge-gray">${g.items.length}</span>
          <button class="btn btn-xs btn-outline" onclick="generarClavesGrupo('${g.grado}','${g.seccion}')">🔑 Generar claves</button>
          <button class="btn btn-xs btn-gray" onclick="exportarListaConClaves('${g.grado}','${g.seccion}')">↓ Excel claves</button>
          <button class="btn btn-xs btn-danger" style="margin-left:auto" onclick="borrarSeccion('${g.grado}','${g.seccion}')">Borrar sección</button>
        </div>
        <table class="est-table"><thead><tr><th>#</th><th>Nombre</th><th>Clave</th><th></th></tr></thead><tbody>
        ${g.items.map(e => {
          var claveHtml = e.clave
            ? `<span style="font-family:monospace;font-weight:700;letter-spacing:2px;color:#1B3A6B;font-size:12px">${esc(e.clave)}</span>
               <button class="btn btn-xs btn-gray" style="margin-left:4px" onclick="editarClave('${e.id}','${esc(e.clave).replace(/'/g,"\\'")}')">✏</button>`
            : `<button class="btn btn-xs btn-outline" onclick="editarClave('${e.id}','')">+ Clave</button>`;
          return `<tr>
            <td>${e.numero_orden}</td><td>${esc(e.nombre)}</td>
            <td id="clave_td_${e.id}">${claveHtml}</td>
            <td><button class="btn btn-xs" style="background:var(--ro2);color:var(--ro);border:none;cursor:pointer;border-radius:4px" onclick="borrarEstudiante('${e.id}')">✕</button></td>
          </tr>`;
        }).join('')}
        </tbody></table></div>`;
    });
  }
  html += '</div>'; return html;
}

function mostrarImportarLista() { var a = document.getElementById('import-area'); a.style.display = a.style.display==='none'?'block':'none'; }
function agregarEstudiante()    { var a = document.getElementById('add-est-area'); a.style.display = a.style.display==='none'?'block':'none'; }

async function procesarCSV() {
  var txt = document.getElementById('csv-input').value.trim();
  if (!txt) { toast('Pega el contenido CSV'); return; }
  var lines = txt.split('\n').filter(l => l.trim()), rows = [], errores = [];
  lines.forEach((line, i) => {
    var parts = line.split(',').map(p => p.trim());
    if (parts.length < 4) { errores.push('Línea '+(i+1)+': formato incorrecto'); return; }
    var [grado, seccion, num, ...rest] = parts; var nombre = rest.join(' ').trim(); var numero = parseInt(num);
    if (!grado||!seccion||!numero||!nombre) { errores.push('Línea '+(i+1)+': datos incompletos'); return; }
    rows.push({ grado, seccion: seccion.toUpperCase(), numero_orden: numero, nombre, activo: true });
  });
  if (errores.length) { toast(errores.length + ' errores: ' + errores[0], 4000); return; }
  var { error } = await rpcAdmin('admin_upsert_estudiantes', { p_filas: rows });
  if (error) { toast('Error: ' + error.message, 4000); return; }
  toast(rows.length + ' estudiantes importados');
  document.getElementById('import-area').style.display = 'none';
  S.adminTab = 'lista'; renderAdmin();
}

async function guardarEstudiante() {
  var grado = document.getElementById('ae-grado').value, seccion = document.getElementById('ae-sec').value;
  var orden = parseInt(document.getElementById('ae-num').value)||0, nombre = document.getElementById('ae-nombre').value.trim();
  if (!nombre||orden<1) { toast('Completa todos los campos'); return; }
  var { error } = await rpcAdmin('admin_upsert_estudiantes', { p_filas: [{grado,seccion,numero_orden:orden,nombre,activo:true}] });
  if (error) { toast('Error: '+error.message); return; }
  toast('Estudiante guardado'); document.getElementById('add-est-area').style.display = 'none';
  S.adminTab = 'lista'; renderAdmin();
}

async function borrarEstudiante(id) { if (!confirm('¿Eliminar este estudiante?')) return; await rpcAdmin('admin_delete_estudiante',{p_id:id}); S.adminTab='lista'; renderAdmin(); }
async function borrarSeccion(grado, seccion) { if (!confirm('¿Borrar todos los estudiantes de '+grado+' sección '+seccion+'?')) return; await rpcAdmin('admin_delete_seccion',{p_grado:grado,p_seccion:seccion}); toast('Sección borrada'); S.adminTab='lista'; renderAdmin(); }

async function buildHistorialTab() {
  var { data } = await sb.from('respuestas_archivadas').select('*').order('archived_at',{ascending:false}).limit(200);
  var arch = data || [];
  var html = `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <span style="font-size:14px;color:var(--sub)">${arch.length} respuestas archivadas</span>
      ${arch.length>0?`<div style="display:flex;gap:8px"><button class="btn btn-success btn-sm" onclick="descargarHistorial()">Descargar Excel</button><button class="btn btn-danger btn-sm" onclick="borrarHistorial()">Borrar historial</button></div>`:''}
    </div>`;
  if (!arch.length) { html += '<p style="color:var(--sub);text-align:center;padding:20px">Sin registros archivados.</p>'; }
  else {
    var porExamen = {};
    arch.forEach(r => { var k = r.examen_titulo||r.examen_id; if (!porExamen[k]) porExamen[k]=[]; porExamen[k].push(r); });
    Object.entries(porExamen).forEach(([titulo, rows]) => {
      html += `<div style="margin-bottom:14px"><div style="font-weight:700;font-size:13px;color:var(--az);margin-bottom:6px">${esc(titulo)} <span class="badge badge-gray">${rows.length}</span></div>
        <table class="est-table"><thead><tr><th>Nombre</th><th>Sec</th><th>Orden</th><th>Archivado</th></tr></thead><tbody>
        ${rows.slice(0,10).map(r=>`<tr style="background:#FFFDE7"><td>${esc(r.nombre)}</td><td>${esc(r.seccion)}</td><td>${r.numero_orden}</td><td style="font-size:11px">${(r.archived_at||'').substring(0,16)}</td></tr>`).join('')}
        ${rows.length>10?`<tr><td colspan="4" style="color:var(--sub);font-size:12px;text-align:center">... y ${rows.length-10} más</td></tr>`:''}
        </tbody></table></div>`;
    });
  }
  html += '</div>'; return html;
}

function descargarHistorial() {
  sb.from('respuestas_archivadas').select('*').order('archived_at',{ascending:false}).then(({data}) => {
    if (!data||!data.length) { toast('Sin datos'); return; }
    var wb = XLSX.utils.book_new();
    var headers = ['Examen','Grado','Periodo','Nombre','Orden','Seccion','Tiempo(seg)','Enviado','Archivado'];
    var rows = [headers, ...data.map(r => [r.examen_titulo,r.examen_grado,r.examen_periodo,r.nombre,r.numero_orden,r.seccion,r.tiempo_usado_seg,(r.submitted_at||'').substring(0,16),(r.archived_at||'').substring(0,16)])];
    var ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = headers.map(() => ({wch:18}));
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    XLSX.writeFile(wb, 'historial_examenes_'+new Date().toISOString().substring(0,10)+'.xlsx');
  });
}

async function borrarHistorial() {
  if (!confirm('¿Borrar PERMANENTEMENTE todo el historial archivado?')) return;
  if (!confirm('Confirma: ¿borrar TODO el historial?')) return;
  var { error } = await rpcAdmin('admin_borrar_historial', {});
  if (error) { toast('Error: '+error.message, 4000); return; }
  toast('Historial borrado'); S.adminTab='historial'; renderAdmin();
}

async function verRespuestas(id) {
  var { data: ex }   = await sb.from('examenes').select('*').eq('id',id).single();
  var { data: resp } = await sb.from('respuestas_examenes').select('*').eq('examen_id',id).order('submitted_at',{ascending:true});
  S.adminExamen = ex; S.respuestas = resp || [];
  S.view = 'admin-resp'; render();
}

function renderAdminResp() {
  var ex = S.adminExamen, qs = ex.preguntas||[], resps = S.respuestas;
  var html = `<div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="S.view='admin';renderAdmin()">&#8592; Volver</button>
      <h2 style="margin:0;flex:1">${esc(ex.titulo)}</h2>
      <span class="badge badge-gray">${resps.length} enviadas</span>
    </div>
    <div class="btn-row" style="margin-bottom:12px">
      <button class="btn btn-success btn-sm" onclick="descargarExcel()">Descargar Excel</button>
      <button class="btn btn-outline btn-sm" onclick="exportarWord()">Exportar Word</button>
      <button class="btn btn-gray btn-sm" onclick="verIntentos('${ex.id}')">👁 Ver intentos</button>
      <button class="btn btn-gray btn-sm" onclick="limpiarSesiones('${ex.id}')">🔒 Limpiar sesiones</button>
      ${resps.length>0?`<button class="btn btn-warn btn-sm" onclick="archivarRespuestas()">Archivar y limpiar</button>`:''}
    </div>
    ${ex.rubrica_txt?`<div class="info-box" style="margin-bottom:10px"><strong>Rúbrica:</strong> ${esc(ex.rubrica_txt)}</div>`:''}
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:var(--az);color:#fff">
      <th style="padding:8px;text-align:left">Nombre</th>
      <th style="padding:8px">Ord</th><th style="padding:8px">Sec</th>
      <th style="padding:8px">Auto</th><th style="padding:8px">Texto</th>
      <th style="padding:8px;background:#1B5E20">Total</th>
      <th style="padding:8px">/ Max</th><th style="padding:8px">%</th><th style="padding:8px">Estado</th>
    </tr></thead><tbody>`;
  resps.forEach((r, ri) => {
    var ptAuto=r.puntos_auto??'—', ptTexto=r.puntos_texto??'—', ptTotal=r.puntos_total??'—', ptMax=r.puntos_maximo??'—';
    var pct = (r.puntos_maximo&&r.puntos_total!=null)?Math.round(r.puntos_total/r.puntos_maximo*100)+'%':'—';
    var pendiente = r.texto_revisado===false&&(r.detalle_notas||[]).some(d=>d.pendiente);
    var estado = r.texto_revisado?'✓ Revisado':(pendiente?'⏳ Pendiente':'✓ Auto');
    var bgRow = ri%2?'#F5F5F5':'#fff';
    var bgTotal = r.puntos_total!=null?(r.puntos_total/r.puntos_maximo>=0.7?'#E8F5E9':r.puntos_total/r.puntos_maximo>=0.5?'#FFF8DC':'#FFEBEE'):bgRow;
    html += `<tr style="background:${bgRow}">
      <td style="padding:7px;font-weight:700">${esc(r.nombre)}
        ${pendiente?`<button class="btn btn-xs" style="background:#FFF3E0;color:#E65100;border:none;cursor:pointer;border-radius:4px;font-size:11px;margin-left:4px" onclick="revisarTexto('${r.id}')">Revisar</button>`:''}
        ${r.cambios_pestana > 0 ? `<span class="badge badge-am" style="margin-left:4px;font-size:10px" title="Cambió de pestaña ${r.cambios_pestana} veces">⚠️ ${r.cambios_pestana}×</span>` : ''}
      </td>
      <td style="padding:7px;text-align:center">${r.numero_orden}</td>
      <td style="padding:7px;text-align:center">${esc(r.seccion)}</td>
      <td style="padding:7px;text-align:center;font-weight:700">${ptAuto}</td>
      <td style="padding:7px;text-align:center;color:${pendiente?'#E65100':'inherit'};font-weight:${pendiente?700:400}">${ptTexto}</td>
      <td style="padding:7px;text-align:center;font-weight:700;background:${bgTotal}">${ptTotal}</td>
      <td style="padding:7px;text-align:center;color:#555">${ptMax}</td>
      <td style="padding:7px;text-align:center;font-weight:700;color:${pct==='—'?'#555':parseInt(pct)>=70?'#1B5E20':parseInt(pct)>=50?'#7B5800':'#B71C1C'}">${pct}</td>
      <td style="padding:7px;font-size:12px">${estado}</td>
    </tr>`;
  });
  html += '</tbody></table></div></div>';
  document.getElementById('main-content').innerHTML = html;
}

async function revisarTexto(respId) {
  var resp = S.respuestas.find(r => r.id === respId); if (!resp) return;
  var ex = S.adminExamen, qs = ex.preguntas||[];
  var pendientes = (resp.detalle_notas||[]).filter(d => d.pendiente);
  var html = `<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:200;overflow-y:auto;padding:20px">
    <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="margin:0;color:#1B3A6B">Revisar respuestas</h2>
        <button class="btn btn-outline btn-sm" onclick="cerrarRevision()">Cerrar</button>
      </div>
      <div class="info-box" style="margin-bottom:16px">
        <strong>${esc(resp.nombre)}</strong> · ${esc(resp.grado)} ${esc(resp.seccion)} · Orden ${resp.numero_orden}<br>
        Auto: <strong>${resp.puntos_auto??0}</strong> · Máximo: <strong>${resp.puntos_maximo}</strong>
      </div>`;
  pendientes.forEach(d => {
    var q = qs[d.qi], respTxt = resp.respuestas[d.qi]||'';
    html += `<div style="border:1px solid #E0E0E0;border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-size:12px;color:#555;margin-bottom:4px">Pregunta ${d.qi+1} · ${q.puntos} pts</div>
      <div style="font-weight:700;font-size:14px;margin-bottom:10px">${esc(q.texto)}</div>
      <div style="background:#F5F5F5;border-radius:8px;padding:10px;font-size:14px;margin-bottom:10px;min-height:60px">${esc(respTxt)||'<em style="color:#aaa">Sin respuesta</em>'}</div>
      ${q.rubrica?`<div class="warn-box" style="margin-bottom:10px;font-size:12px"><strong>Rúbrica:</strong> ${esc(q.rubrica)}</div>`:''}
      <div style="display:flex;align-items:center;gap:10px">
        <label style="font-size:13px;font-weight:700;color:#555;white-space:nowrap">Puntos (max ${q.puntos}):</label>
        <input type="number" id="pts_${d.qi}" min="0" max="${q.puntos}" value="0" style="width:70px;font-size:15px;font-weight:700">
        <div style="display:flex;gap:5px">
          ${[0,Math.round(q.puntos*.25),Math.round(q.puntos*.5),Math.round(q.puntos*.75),q.puntos].map(v=>`<button class="btn btn-xs btn-gray" onclick="document.getElementById('pts_${d.qi}').value=${v}">${v}</button>`).join('')}
        </div>
      </div>
    </div>`;
  });
  html += `<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <div id="revision-error" style="display:none;flex:1" class="warn-box"></div>
      <button class="btn btn-outline" onclick="cerrarRevision()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarRevision('${respId}',${JSON.stringify(pendientes.map(d=>d.qi))})">Guardar notas</button>
    </div></div></div>`;
  var overlay = document.createElement('div'); overlay.id = 'revision-overlay'; overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

function cerrarRevision() { var el = document.getElementById('revision-overlay'); if (el) el.remove(); }

async function guardarRevision(respId, qIndices) {
  var btn = document.querySelector('#revision-overlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  var ptsTxt = 0;
  var resp = S.respuestas.find(r => r.id === respId); if (!resp) return;
  var detalle = JSON.parse(JSON.stringify(resp.detalle_notas||[]));
  qIndices.forEach(qi => {
    var input = document.getElementById('pts_'+qi), val = input ? (parseInt(input.value)||0) : 0;
    ptsTxt += val;
    var item = detalle.find(d => d.qi === qi);
    if (item) { item.pts = val; item.pendiente = false; }
    else detalle.push({ qi, pts: val, pendiente: false, auto: false });
  });
  var ptTotal = (resp.puntos_auto||0) + ptsTxt;
  var { error } = await rpcAdmin('admin_guardar_nota', { p_resp_id:respId, p_pts_texto:ptsTxt, p_pts_total:ptTotal, p_detalle:detalle });
  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar notas'; }
    var errDiv = document.getElementById('revision-error');
    if (errDiv) { errDiv.style.display = 'block'; errDiv.textContent = 'Error: ' + error.message; }
    return;
  }
  cerrarRevision(); toast('Nota guardada: '+ptTotal+'/'+resp.puntos_maximo+' pts');
  await verRespuestas(S.adminExamen.id);
}

function descargarExcel() {
  var ex = S.adminExamen, qs = ex.preguntas||[], resps = S.respuestas;
  var wb = XLSX.utils.book_new();
  var h1 = ['Nombre','Orden','Seccion','Grado','Pts Auto','Pts Texto','Pts Total','Maximo','%','Revisado','Tiempo(seg)','Enviado'];
  qs.forEach((q,i) => { if (q.tipo !== 'lectura') h1.push('P'+(i+1)+' ['+q.tipo+']('+q.puntos+'pts): '+(q.texto||'').substring(0,35)); });
  var rows = [h1];
  resps.forEach(r => {
    var pct = (r.puntos_maximo&&r.puntos_total!=null)?Math.round(r.puntos_total/r.puntos_maximo*100)+'%':'—';
    var row = [r.nombre,r.numero_orden,r.seccion,r.grado,r.puntos_auto??'—',r.puntos_texto??'—',r.puntos_total??'—',r.puntos_maximo??'—',pct,r.texto_revisado?'Si':'Pendiente',r.tiempo_usado_seg||0,(r.submitted_at||'').substring(0,16)];
    qs.forEach((q, qi) => { if (q.tipo === 'lectura') return; var v = r.respuestas[qi]; row.push(v===undefined?'':(typeof v==='object'?JSON.stringify(v):String(v))); });
    rows.push(row);
  });
  var ws1 = XLSX.utils.aoa_to_sheet(rows); ws1['!cols'] = h1.map((_,i) => ({wch:i<6?16:45}));
  XLSX.utils.book_append_sheet(wb, ws1, 'Respuestas');
  var rub = [['#','Tipo','Pregunta','Puntos','Criterios'], ...qs.filter(q => q.tipo !== 'lectura').map((q,i) => [i+1,q.tipo,q.texto||'',q.puntos||0,q.rubrica||(q.tipo==='vf'?'Correcta: '+q.correcta:q.tipo==='multiple'?'Correcta: '+q.correcta:'—')])];
  var ws2 = XLSX.utils.aoa_to_sheet(rub); ws2['!cols'] = [{wch:4},{wch:14},{wch:50},{wch:8},{wch:60}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Rubrica');
  XLSX.writeFile(wb, ex.titulo+'_'+ex.grado+'_P'+ex.periodo+'_'+new Date().toISOString().substring(0,10)+'.xlsx');
  toast('Excel descargado');
}

async function archivarRespuestas() {
  if (!confirm('¿Archivar las '+S.respuestas.length+' respuestas y borrarlas de la vista activa?')) return;
  var ids = S.respuestas.map(r => r.id);
  var { error } = await rpcAdmin('admin_archivar_respuestas', { p_examen_id: S.adminExamen.id, p_resp_ids: ids });
  if (error) { toast('Error al archivar: '+error.message, 4000); return; }
  toast(ids.length+' respuestas archivadas'); S.view='admin'; S.adminTab='examenes'; renderAdmin();
}

// ── Crear / Editar examen ─────────────────────────────────────
function renderAdminCrear() {
  var ex = S.adminExamen, GRADOS = GRADOS_CONFIG.filter(g => g.disponible).map(g => g.nivel), secs = ex?.secciones_activas||[];
  var html = `<div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <button class="btn btn-outline btn-sm" onclick="S.view='admin';S.qBuilders=[];render()">&#8592; Volver</button>
      <h2 style="margin:0">${ex?'Editar examen':'Nuevo examen'}</h2>
    </div>
    <div class="form-sec">
      <div class="form-sec-title">Información general</div>
      <label>Título *</label><input type="text" id="f-titulo" value="${esc(ex?.titulo||'')}" placeholder="Ej: S1 — Mi examen">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div><label>Grado</label><select id="f-grado">${GRADOS.map(g=>`<option ${ex?.grado===g?'selected':''}>${g}</option>`).join('')}</select></div>
        <div><label>Período</label><select id="f-periodo">${[1,2,3,4].map(p=>`<option ${ex?.periodo===p?'selected':''}>${p}</option>`).join('')}</select></div>
        <div><label>Tiempo (min)</label><input type="number" id="f-tiempo" value="${ex?.tiempo_minutos||0}" min="0" max="180"></div>
      </div>
      <label>Descripción</label><input type="text" id="f-desc" value="${esc(ex?.descripcion||'')}">
      <label>Instrucciones</label><textarea id="f-instr">${esc(ex?.instrucciones||'')}</textarea>
      <label>Rúbrica general</label><textarea id="f-rubrica" rows="2">${esc(ex?.rubrica_txt||'')}</textarea>
    </div>
    <div class="form-sec">
      <div class="form-sec-title">Control de acceso</div>
      <label>Secciones autorizadas (vacío = todas)</label>
      <div class="sec-chips" id="sec-chips">${SECCIONES.map(s=>`<div class="sec-chip${secs.includes(s)?' active':''}" id="chip_${s}" onclick="toggleChip('${s}')">${s}</div>`).join('')}</div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="f-validar" ${ex ? (ex.validar_lista?'checked':'') : 'checked'} style="width:auto">
        <label style="margin:0;font-size:14px">Verificar contra la lista del curso</label>
      </div>
    </div>
    <div class="form-sec">
      <div class="form-sec-title">Preguntas</div>
      <div id="q-list"></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-outline btn-sm" onclick="addQ('multiple')">+ Múltiple</button>
        <button class="btn btn-outline btn-sm" onclick="addQ('texto')">+ Texto libre</button>
        <button class="btn btn-outline btn-sm" onclick="addQ('vf')">+ V/F</button>
        <button class="btn btn-outline btn-sm" onclick="addQ('completar')">+ Completar</button>
        <button class="btn btn-outline btn-sm" onclick="addQ('ordenar')">+ Ordenar</button>
        <button class="btn btn-outline btn-sm" onclick="addQ('escala')">+ Escala 1-5</button>
        <button class="btn btn-sm" style="background:#EBF2FF;color:#1B3A6B;border:1.5px solid #C7DEFF" onclick="addQ('lectura')">📖 + Lectura</button>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" onclick="S.qBuilders=[];S.view='admin';render()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarExamen()">Guardar examen</button>
    </div>
  </div>`;
  document.getElementById('main-content').innerHTML = html;
  renderQBuilders();
}

function toggleChip(s) { var c = document.getElementById('chip_'+s); c.classList.toggle('active'); }
function getSecsActivas() { return SECCIONES.filter(s => { var c = document.getElementById('chip_'+s); return c && c.classList.contains('active'); }); }

function addQ(tipo) {
  var defaults = {
    multiple:  { tipo:'multiple',  texto:'', opciones:['','','',''], correcta:'A', puntos:5 },
    texto:     { tipo:'texto',     texto:'', puntos:10, rubrica:'' },
    vf:        { tipo:'vf',        texto:'', correcta:'V', puntos:5 },
    completar: { tipo:'completar', texto:'La vida de Jesús es ___ y su misión fue ___', puntos:10 },
    ordenar:   { tipo:'ordenar',   texto:'Ordena los siguientes elementos:', items:['Elemento 1','Elemento 2','Elemento 3'], puntos:10 },
    escala:    { tipo:'escala',    texto:'', etiquetas:['Nada','Poco','Regular','Bastante','Mucho'], puntos:5 },
    lectura:   { tipo:'lectura',   texto:'Título del texto (opcional)', contenido:'Escribe aquí el texto de lectura o contexto que el estudiante debe leer antes de responder las preguntas siguientes.', puntos:0 }
  };
  S.qBuilders.push({...defaults[tipo]}); renderQBuilders();
}

function renderQBuilders() {
  var el = document.getElementById('q-list'); if (!el) return;
  var TN = { multiple:'Opción múltiple', texto:'Texto libre', vf:'Verdadero/Falso', completar:'Completar la frase', ordenar:'Ordenar elementos', escala:'Escala 1-5', lectura:'📖 Lectura / Contexto' };
  el.innerHTML = S.qBuilders.map((q, i) => {
    var extra = '';
    if (q.tipo==='multiple') {
      extra = '<div style="margin-top:8px">'+['A','B','C','D'].map((L,oi)=>`<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center"><span style="width:20px;font-weight:700;font-size:13px">${L}</span><input type="text" value="${esc((q.opciones||[])[oi]||'')}" placeholder="Opción ${L}" oninput="S.qBuilders[${i}].opciones[${oi}]=this.value" style="flex:1;font-size:13px"><input type="radio" name="cor_${i}" ${q.correcta===L?'checked':''} onchange="S.qBuilders[${i}].correcta='${L}'" title="Correcta"></div>`).join('')+'<small style="color:var(--sub)">El círculo marca la opción correcta</small></div>';
    } else if (q.tipo==='vf') {
      extra = `<div style="margin-top:8px;display:flex;gap:12px;align-items:center"><span style="font-size:12px;color:var(--sub)">Correcta:</span><label><input type="radio" name="vf_${i}" ${q.correcta==='V'?'checked':''} onchange="S.qBuilders[${i}].correcta='V'"> Verdadero</label><label><input type="radio" name="vf_${i}" ${q.correcta==='F'?'checked':''} onchange="S.qBuilders[${i}].correcta='F'"> Falso</label></div>`;
    } else if (q.tipo==='ordenar') {
      extra = `<div style="margin-top:6px"><label style="font-size:12px">Items (uno por línea — el orden que escribas es el CORRECTO):</label><textarea rows="4" style="font-size:13px" oninput="S.qBuilders[${i}].items=this.value.split('\\n').filter(s=>s.trim())">${esc((q.items||[]).join('\n'))}</textarea></div>`;
    } else if (q.tipo==='completar') {
      extra = `<small style="color:var(--sub);display:block;margin-top:4px">Usa ___ para los espacios.</small><div style="margin-top:6px"><label style="font-size:12px;color:#1B5E20;font-weight:700">Respuestas correctas (una por línea):</label><textarea rows="3" style="font-size:12px;color:#1B5E20;border-color:#A5D6A7" oninput="S.qBuilders[${i}].respuestas=this.value.split('\\n').filter(s=>s.trim())">${esc((q.respuestas||[]).join('\n'))}</textarea></div>`;
    } else if (q.tipo==='texto') {
      extra = `<div style="margin-top:6px"><label style="font-size:12px">Criterios de evaluación:</label><textarea rows="2" style="font-size:13px" oninput="S.qBuilders[${i}].rubrica=this.value">${esc(q.rubrica||'')}</textarea></div>`;
    } else if (q.tipo==='lectura') {
      extra = `<div style="margin-top:6px"><label style="font-size:12px;color:#1B3A6B;font-weight:700">Contenido del texto de lectura:</label><textarea rows="5" style="font-size:13px;border-color:#C7DEFF;background:#F8FAFF" oninput="S.qBuilders[${i}].contenido=this.value">${esc(q.contenido||'')}</textarea><div style="font-size:11px;color:#64748B;margin-top:4px">💡 Este bloque se muestra al estudiante como contexto. No suma puntos.</div></div>`;
    } else if (q.tipo==='escala') {
      extra = `<div style="margin-top:6px"><label style="font-size:12px">Etiquetas 1-5 (separadas por coma):</label><input type="text" style="font-size:13px" value="${esc((q.etiquetas||[]).join(','))}" oninput="S.qBuilders[${i}].etiquetas=this.value.split(',').map(s=>s.trim())"></div>`;
    }
    var esLectura = q.tipo === 'lectura';
    var tituloLabel = esLectura ? 'Título del texto (opcional)' : 'Pregunta ' + (i+1);
    var ptsField = esLectura ? '' : `<div style="display:flex;gap:8px;align-items:center;margin-top:4px"><label style="font-size:12px;margin:0;flex-shrink:0">Puntos:</label><input type="number" value="${q.puntos||5}" min="1" max="100" style="width:65px;font-size:13px" oninput="S.qBuilders[${i}].puntos=parseInt(this.value)||5"></div>`;
    var builderStyle = esLectura ? 'border-color:#C7DEFF;background:#F0F7FF' : '';
    return `<div class="q-builder" style="${builderStyle}"><span class="q-type-pill">${TN[q.tipo]}</span><button class="remove-q" onclick="S.qBuilders.splice(${i},1);renderQBuilders()">Quitar</button><label style="font-size:12px">${tituloLabel}</label><textarea rows="2" style="font-size:13px" oninput="S.qBuilders[${i}].texto=this.value">${esc(q.texto||'')}</textarea>${ptsField}${extra}</div>`;
  }).join('');
}

async function guardarExamen() {
  var titulo = document.getElementById('f-titulo').value.trim();
  if (!titulo) { toast('Escribe un título'); return; }
  if (!S.qBuilders.length) { toast('Agrega al menos una pregunta'); return; }
  var payload = { titulo, grado:document.getElementById('f-grado').value, periodo:parseInt(document.getElementById('f-periodo').value)||1, tiempo_minutos:parseInt(document.getElementById('f-tiempo').value)||0, descripcion:document.getElementById('f-desc').value.trim(), instrucciones:document.getElementById('f-instr').value.trim(), rubrica_txt:document.getElementById('f-rubrica').value.trim(), preguntas:[...S.qBuilders], secciones_activas:getSecsActivas(), validar_lista:document.getElementById('f-validar').checked, updated_at:new Date().toISOString() };
  var { error } = await rpcAdmin('admin_upsert_examen', { p_id:S.adminExamen?S.adminExamen.id:null, p_datos:payload });
  if (error) { toast('Error: '+error.message, 4000); return; }
  S.qBuilders = []; toast(S.adminExamen?'Examen actualizado':'Examen creado');
  S.adminExamen = null; S.view = 'admin'; renderAdmin();
}

async function rpcAdmin(fn, params) {
  var { data, error } = await sb.rpc(fn, { p_pin_hash: S.pinHash, ...params });
  if (error) return { error };
  if (data && data.error) return { error: { message: data.error } };
  return { data };
}

function mostrarImportJSON() { var a = document.getElementById('import-json-area'); if (a) a.style.display = a.style.display==='none'?'block':'none'; }

async function procesarImportJSON() {
  var txt = document.getElementById('json-input').value.trim();
  if (!txt) { toast('Pega el JSON del examen'); return; }
  var data; try { data = JSON.parse(txt); } catch(e) { toast('JSON inválido: '+e.message,4000); return; }
  if (!data.titulo||!Array.isArray(data.preguntas)) { toast('El JSON necesita titulo + preguntas'); return; }
  var TIPOS_VALIDOS = ['multiple','texto','vf','completar','ordenar','escala','lectura'];
  var qs_invalidas = data.preguntas.filter(q => !q.tipo || !TIPOS_VALIDOS.includes(q.tipo));
  if (qs_invalidas.length) { toast('Tipo inválido en pregunta(s): ' + qs_invalidas.map(q => '"'+(q.tipo||'sin tipo')+'"').join(', '), 5000); return; }
  var payload = { titulo:data.titulo, descripcion:data.descripcion||'', grado:data.grado||'', periodo:parseInt(data.periodo)||0, tiempo_minutos:parseInt(data.tiempo_minutos)||0, instrucciones:data.instrucciones||'', rubrica_txt:data.rubrica_txt||'', preguntas:data.preguntas, secciones_activas:data.secciones_activas||[], validar_lista:data.validar_lista||false, activo:false, updated_at:new Date().toISOString() };
  var { error } = await rpcAdmin('admin_upsert_examen', { p_id:null, p_datos:payload });
  if (error) { toast('Error al importar: '+error.message,4000); return; }
  toast('Examen importado: '+data.titulo);
  document.getElementById('import-json-area').style.display = 'none';
  document.getElementById('json-input').value = '';
  S.adminTab = 'examenes'; renderAdmin();
}

function exportarWord() {
  var ex = S.adminExamen, qs = ex.preguntas||[];
  var TIPO = {multiple:'Opción múltiple',texto:'Respuesta abierta',vf:'Verdadero/Falso',completar:'Completar',ordenar:'Ordenar',escala:'Escala 1-5',lectura:'Lectura / Contexto'};
  var L = ['A','B','C','D']; var doc = '';
  doc += 'EXAMEN\n'+ex.titulo+'\n'+ex.grado+' | Período '+ex.periodo+(ex.tiempo_minutos>0?' | '+ex.tiempo_minutos+' min':'')+'\n\n';
  doc += 'Nombre: ___________________________________\nNúmero: _____ Sección: _____ Fecha: _____________\n\n';
  if (ex.instrucciones) doc += 'INSTRUCCIONES: '+ex.instrucciones+'\n\n';
  doc += '='.repeat(60)+'\n\n';
  var totalPts = 0;
  qs.forEach((q,i) => {
    if (q.tipo === 'lectura') return;
    totalPts += q.puntos||0;
    doc += (i+1)+'. ['+TIPO[q.tipo]+' | '+(q.puntos||0)+' pts]\n'+q.texto+'\n\n';
    if (q.tipo==='multiple') (q.opciones||[]).forEach((op,oi) => { doc += '   ('+L[oi]+') '+op+'\n'; });
    else if (q.tipo==='vf') doc += '   ( ) Verdadero     ( ) Falso\n';
    else if (q.tipo==='ordenar') (q.items||[]).forEach(it => { doc += '   ( ) '+it+'\n'; });
    else if (q.tipo==='escala') { var lbs=q.etiquetas||['1','2','3','4','5']; doc+='   '+lbs.map((l,n)=>'[ ] '+(n+1)+'-'+l).join('  ')+'\n'; }
    else if (q.tipo==='texto') doc += '   ___________________________________________\n'.repeat(5);
    doc += '\n';
  });
  doc += '='.repeat(60)+'\nTOTAL: '+totalPts+' puntos\n';
  var blob = new Blob([doc], { type:'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = ex.titulo+'_'+ex.grado+'_P'+ex.periodo+'.txt'; a.click();
  URL.revokeObjectURL(url); toast('Documento descargado');
}

// ── Ver intentos ──────────────────────────────────────────────
async function verIntentos(examenId) {
  var { data } = await rpcAdmin('admin_ver_intentos', { p_examen_id: examenId });
  if (!data || !data.ok) { toast('Error al cargar intentos'); return; }
  var items = data.data || [];
  var sinEnvio = items.filter(i => !i.envio_completado);
  var conEnvio = items.filter(i =>  i.envio_completado);
  var overlay = document.createElement('div'); overlay.id = 'intentos-overlay';
  overlay.innerHTML = `
  <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:200;overflow-y:auto;padding:20px">
    <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="margin:0;color:#1B3A6B">Registro de intentos</h2>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="buscarCodigo()">🔍 Verificar código</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('intentos-overlay').remove()">Cerrar</button>
        </div>
      </div>
      ${sinEnvio.length>0 ? `
      <div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#E65100;margin-bottom:10px">⚠ Iniciaron pero NO enviaron — ${sinEnvio.length}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="color:#888;font-size:11px">
          <th style="text-align:left;padding:5px 8px">Nombre</th><th style="padding:5px 8px">Ord</th>
          <th style="padding:5px 8px">Sec</th><th style="padding:5px 8px">Código</th>
          <th style="padding:5px 8px">Inició</th><th></th>
        </tr></thead><tbody>
          ${sinEnvio.map(i=>`<tr style="border-top:1px solid #FFE0B2">
            <td style="padding:6px 8px;font-weight:600">${esc(i.nombre)}</td>
            <td style="padding:6px 8px;text-align:center">${i.numero_orden}</td>
            <td style="padding:6px 8px;text-align:center">${esc(i.seccion)}</td>
            <td style="padding:6px 8px;font-family:monospace;font-weight:700;color:#1B3A6B;letter-spacing:2px">${esc(i.codigo_inicio)}</td>
            <td style="padding:6px 8px;font-size:12px;color:#666">${esc(i.iniciado_at)}</td>
            <td style="padding:6px 8px"><button class="btn btn-xs btn-success" onclick="resetearIntento('${examenId}',${i.numero_orden},'${esc(i.grado)}','${esc(i.seccion)}','${esc(i.nombre)}',this)">Reactivar</button></td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : `<div class="success-box" style="margin-bottom:14px">✓ Todos los que iniciaron también enviaron.</div>`}
      ${conEnvio.length>0 ? `
      <div style="font-size:13px;font-weight:700;color:#555;margin-bottom:8px">Completados (${conEnvio.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>
        ${conEnvio.map(i=>`<tr style="border-bottom:1px solid #F0F4FA">
          <td style="padding:6px 8px;font-weight:600">${esc(i.nombre)}</td>
          <td style="padding:6px 8px;text-align:center;color:#888">${i.numero_orden}</td>
          <td style="padding:6px 8px;text-align:center;color:#888">${esc(i.seccion)}</td>
          <td style="padding:6px 8px;font-family:monospace;color:#888;font-size:12px">${esc(i.codigo_inicio)}</td>
          <td style="padding:6px 8px;font-size:12px;color:#888">${esc(i.iniciado_at)}</td>
          <td style="padding:6px 8px;color:#1B5E20;font-size:12px">✓ Enviado</td>
        </tr>`).join('')}
      </tbody></table>` : ''}
      <div style="margin-top:14px;font-size:12px;color:#AAA;border-top:1px solid #F0F0F0;padding-top:10px">
        Total: ${items.length} · Enviados: ${conEnvio.length} · Solo iniciaron: ${sinEnvio.length}
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function resetearIntento(examenId, orden, grado, seccion, nombre, btnEl) {
  if (!confirm('¿Reactivar acceso para '+nombre+'?\nPodrá volver a entrar al examen desde el inicio.')) return;
  btnEl.disabled = true; btnEl.textContent = '...';
  var { error } = await rpcAdmin('admin_resetear_intento', { p_examen_id:examenId, p_numero_orden:orden, p_grado:grado, p_seccion:seccion });
  if (error) { toast('Error: '+error.message, 4000); btnEl.disabled=false; btnEl.textContent='Reactivar'; return; }
  toast('Acceso reactivado para '+nombre);
  document.getElementById('intentos-overlay').remove();
  verIntentos(examenId);
}

async function buscarCodigo() {
  var codigo = prompt('Ingresa el código del estudiante:');
  if (!codigo || !codigo.trim()) return;
  var { data } = await rpcAdmin('admin_verificar_codigo', { p_codigo: codigo.trim() });
  if (!data || !data.ok) { toast('Código no encontrado en el sistema', 3000); return; }
  var d = data.data;
  alert('✓ Código válido\n\nExamen: '+d.examen_titulo+'\nEstudiante: '+d.nombre+'\nGrado: '+d.grado+' · Sección: '+d.seccion+' · Orden: '+d.numero_orden+'\nInició: '+d.iniciado_at+'\nEstado: '+(d.envio_completado?'✓ Envió el examen':'⚠ Solo inició, no envió'));
}

// ── Modal: Estructura JSON ────────────────────────────────────
function mostrarEstructuraJSON() {
  var ejemplo = {
    "titulo": "Examen S3 — Los Sacramentos",
    "grado": "4to",
    "periodo": 2,
    "tiempo_minutos": 40,
    "descripcion": "Evaluación del tercer semana del período 2",
    "instrucciones": "Lee cada pregunta con atención antes de responder.",
    "rubrica_txt": "Se evalúa comprensión conceptual y redacción.",
    "secciones_activas": ["A", "B"],
    "validar_lista": true,
    "activo": false,
    "preguntas": [
      {
        "tipo": "lectura",
        "texto": "El Bautismo — Texto de referencia",
        "contenido": "El Bautismo es el primer sacramento de la Iglesia...\nMediante él, la persona es incorporada a la comunidad cristiana."
      },
      {
        "tipo": "multiple",
        "texto": "¿Cuál es el primer sacramento de iniciación cristiana?",
        "opciones": ["La Eucaristía", "El Bautismo", "La Confirmación", "La Penitencia"],
        "correcta": "B",
        "puntos": 5
      },
      {
        "tipo": "vf",
        "texto": "La Eucaristía es el primer sacramento que recibe un cristiano.",
        "correcta": "F",
        "puntos": 5
      },
      {
        "tipo": "completar",
        "texto": "El Bautismo nos incorpora a la ___ y nos libera del ___.",
        "respuestas": ["Iglesia", "pecado original"],
        "puntos": 10
      },
      {
        "tipo": "ordenar",
        "texto": "Ordena los sacramentos de iniciación en el orden correcto:",
        "items": ["Bautismo", "Confirmación", "Eucaristía"],
        "puntos": 10
      },
      {
        "tipo": "texto",
        "texto": "Explica con tus propias palabras qué significa ser bautizado.",
        "rubrica": "Menciona al menos: incorporación a la Iglesia, gracia, agua.",
        "puntos": 10
      },
      {
        "tipo": "escala",
        "texto": "¿Qué tan importante crees que es el Bautismo en tu vida?",
        "etiquetas": ["Nada", "Poco", "Regular", "Bastante", "Mucho"],
        "puntos": 5
      }
    ]
  };

  var jsonStr = JSON.stringify(ejemplo, null, 2);

  var overlay = document.createElement('div');
  overlay.id = 'json-struct-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3>Estructura JSON para importar examen</h3>
        <button class="modal-close" onclick="document.getElementById('json-struct-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-sub">
          Copia este JSON, modifica los valores según tu examen y luego usa <strong>"↑ Importar JSON"</strong> para cargarlo.
          Incluye todos los tipos de pregunta disponibles como referencia.
        </p>
        <div class="json-block">
          <button class="json-copy-btn" id="json-copy-struct-btn" onclick="copiarEstructuraJSON()">Copiar</button>
          <pre id="json-struct-pre">${escJsonDisplay(jsonStr)}</pre>
        </div>
        <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
          <div style="background:#F0F7FF;border:1px solid #C7DEFF;border-radius:8px;padding:12px">
            <div style="font-weight:700;color:#1B3A6B;margin-bottom:6px">Tipos de pregunta</div>
            <div style="color:#475569;line-height:1.8">
              📖 <code>lectura</code> — Bloque de contexto, sin nota<br>
              ✅ <code>multiple</code> — Opción múltiple (A–D)<br>
              ✔️ <code>vf</code> — Verdadero / Falso<br>
              ✏️ <code>completar</code> — Completar con ___<br>
              ↕️ <code>ordenar</code> — Arrastrar y ordenar<br>
              📝 <code>texto</code> — Respuesta abierta (revisión manual)<br>
              ⭐ <code>escala</code> — Escala 1 a 5
            </div>
          </div>
          <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:12px">
            <div style="font-weight:700;color:#92400E;margin-bottom:6px">Campos obligatorios</div>
            <div style="color:#475569;line-height:1.8">
              <code>titulo</code>, <code>grado</code>, <code>periodo</code><br>
              <code>preguntas[]</code> con al menos 1 item<br>
              Cada pregunta: <code>tipo</code> + <code>texto</code><br>
              <code>correcta</code>: "A","B","C","D" o "V"/"F"<br>
              <code>activo: false</code> para crear cerrado
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function escJsonDisplay(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function copiarEstructuraJSON() {
  var pre = document.getElementById('json-struct-pre');
  if (!pre) return;
  var text = pre.textContent;
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.getElementById('json-copy-struct-btn');
    if (btn) { btn.textContent = '✓ Copiado'; btn.classList.add('copied'); }
    setTimeout(function() {
      if (btn) { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }
    }, 2000);
  }).catch(function() { toast('No se pudo copiar al portapapeles', 3000); });
}

// ── Claves individuales ───────────────────────────────────────
function _genClave() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function generarClavesGrupo(grado, seccion) {
  var sinClave = S.listaEst.filter(e => e.grado === grado && e.seccion === seccion && !e.clave);
  if (!sinClave.length) { toast('Todos ya tienen clave en ' + grado + '-' + seccion); return; }
  if (!confirm('¿Generar claves para ' + sinClave.length + ' estudiante(s) de ' + grado + ' sección ' + seccion + '?')) return;
  var filas = sinClave.map(e => ({ id: e.id, clave: _genClave() }));
  var { error } = await rpcAdmin('admin_actualizar_claves', { p_filas: filas });
  if (error) { toast('Error al generar claves: ' + error.message, 4000); return; }
  toast(filas.length + ' clave(s) generadas');
  S.adminTab = 'lista'; renderAdmin();
}

function exportarListaConClaves(grado, seccion) {
  var items = S.listaEst.filter(e => e.grado === grado && e.seccion === seccion)
    .sort((a, b) => a.numero_orden - b.numero_orden);
  if (!items.length) { toast('Sin estudiantes en este grupo'); return; }
  var wb = XLSX.utils.book_new();
  var rows = [['#', 'Nombre', 'Clave'], ...items.map(e => [e.numero_orden, e.nombre, e.clave || ''])];
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:5}, {wch:35}, {wch:10}];
  XLSX.utils.book_append_sheet(wb, ws, (grado + '-' + seccion).replace(/[^a-zA-Z0-9-]/g, ''));
  XLSX.writeFile(wb, 'claves_' + grado + '_sec' + seccion + '_' + new Date().toISOString().substring(0,10) + '.xlsx');
  toast('Lista con claves descargada');
}

function editarClave(id, claveActual) {
  var td = document.getElementById('clave_td_' + id);
  if (!td) return;
  td.innerHTML = `
    <input type="text" id="ci_${id}" value="${esc(claveActual)}" maxlength="8" placeholder="------"
      style="width:80px;font-size:13px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;padding:3px 6px;border:1.5px solid var(--az);border-radius:4px"
      onkeydown="if(event.key==='Enter')guardarClave('${id}',this.value)">
    <button class="btn btn-xs btn-primary" style="margin-left:4px" onclick="guardarClave('${id}',document.getElementById('ci_${id}').value)">✓</button>
    <button class="btn btn-xs btn-gray" onclick="S.adminTab='lista';renderAdmin()">✗</button>`;
  var inp = document.getElementById('ci_' + id);
  if (inp) { inp.focus(); inp.select(); }
}

async function guardarClave(id, clave) {
  clave = (clave || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
  var { error } = await rpcAdmin('admin_actualizar_clave', { p_id: id, p_clave: clave || null });
  if (error) { toast('Error: ' + error.message); return; }
  toast(clave ? 'Clave guardada: ' + clave : 'Clave eliminada');
  S.adminTab = 'lista'; renderAdmin();
}

// ── Sesiones activas ──────────────────────────────────────────
async function limpiarSesiones(examenId) {
  if (!confirm('¿Limpiar todas las sesiones activas de este examen?\nEstudiantes con sesión abierta podrán entrar de nuevo.')) return;
  var { error } = await rpcAdmin('admin_limpiar_sesiones', { p_examen_id: examenId });
  if (error) { toast('Error: ' + error.message, 4000); return; }
  toast('Sesiones limpiadas');
}
