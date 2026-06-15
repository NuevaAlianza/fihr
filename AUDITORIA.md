# Auditoría técnica — Exámenes Santo Cura de Ars
**Fecha:** 2026-06-15  
**Archivos analizados:** index.html · css/styles.css · js/config.js · js/utils.js · js/student.js · js/admin.js · js/app.js · manifest.json · sw.js

---

## 1. BUGS ENCONTRADOS

### 1.1 Cálculo de calificaciones

#### BUG-01 — `ordenar`: orden por defecto nunca se guarda ★ ALTO
**Archivo:** `js/student.js:359, 494-519, 545-549`

`entrarAlExamen()` inicializa `S.ordenItems[i]` pero **no** inicializa `S.resp[i]`. El drag-and-drop solo guarda en `S.resp[qi]` cuando el estudiante arrastra un elemento (`initDrag` → drop handler). Si el estudiante ve la pregunta y no arrastra nada (porque cree que el orden mostrado ya es correcto, o simplemente lo omite), `S.resp[qi]` queda `undefined`.

En `calcularNota`:
```js
var studentOrder = Array.isArray(resp) ? resp : [];
if (!studentOrder.length) break; // → 0 puntos
```
**Resultado:** estudiante que no toca la pregunta `ordenar` obtiene 0 puntos aunque el orden presentado sea correcto o él lo haya revisado visualmente como correcto.

**Fix:** en `entrarAlExamen`, inicializar también `S.resp[i] = [...q.items]` para preguntas tipo `ordenar`.

---

#### BUG-02 — `completar`: regala puntos si no hay respuestas definidas ★ MEDIO
**Archivo:** `js/student.js:553-555`

```js
var correctBlanks = q.respuestas || [];
if (!correctBlanks.length) { item.pts = pts; break; } // → puntos completos
```
Si el admin crea una pregunta `completar` y omite el campo `respuestas`, **todos los estudiantes reciben los puntos completos** automáticamente, independientemente de lo que escriban.

---

#### BUG-03 — `completar`: algoritmo de coincidencia excesivamente permisivo ★ MEDIO
**Archivo:** `js/student.js:559-560`

```js
if (given===cn
  || (given.length>3 && cn.includes(given))
  || (cn.length>3 && given.includes(cn.substring(0, Math.ceil(cn.length*0.6)))))
  blancoCorrectos++;
```
- Condición 2: si el estudiante escribe "pecado" (6 chars) y la respuesta correcta es "pecado original", `cn.includes("pecado")` → **CORRECTO**. Cualquier subcadena de la respuesta correcta > 3 chars basta.
- Condición 3: basta con que la respuesta del estudiante contenga el **primer 60%** de la respuesta correcta. Para "Bautismo" (8 chars), el primer 60% es "Bauti" (5 chars) → el estudiante puede escribir "Bautismo de agua" y cuenta correcto.

Dependiendo de la intención pedagógica esto puede ser aceptable, pero es importante que el admin lo sepa.

---

#### BUG-04 — `lectura`: suma y resta `pts` del máximo cuando `puntos` no es 0 ★ BAJO
**Archivo:** `js/student.js:564-566`

```js
case 'lectura':
    item.auto = true; item.pts = 0; puntos_maximo -= pts; break;
```
El `forEach` sumó `pts` antes del switch: `puntos_maximo += pts`. Si alguien importa un JSON con una pregunta `lectura` que tiene `puntos: 5` (no es el default, pero válido), el total se cancela correctamente (suma 5, resta 5). El comportamiento es correcto pero frágil; el cálculo es confuso.

---

#### BUG-05 — `multiple`: radio buttons en el builder no reflejan opción guardada al volver a editar ★ BAJO
**Archivo:** `js/admin.js:487`

En `renderQBuilders`, el radio button para "correcta" usa `${q.correcta===L?'checked':''}`. Si el admin cambia la opción correcta y luego llama a `renderQBuilders()` de nuevo (al agregar otra pregunta), los radios se regeneran correctamente. Sin embargo, si el admin **navega fuera y vuelve** a editar (`editarExamen`), `S.qBuilders` se carga desde `data.preguntas`. Los valores se preservan. No es un bug, pero si el admin cambia la `correcta` vía radio pero no disparó el `onchange`, podría quedar desactualizada. El `onchange` sí está ligado al DOM, así que debería estar bien.

---

### 1.2 Flujo del estudiante

#### BUG-06 — Banner PWA en selector nunca se muestra ★ ALTO
**Archivo:** `js/student.js:34-38`, `js/utils.js:93-98`

El div `#pwa-banner` en `renderSelector` tiene `style="display:none"` **inline**. El manejador `beforeinstallprompt` en `utils.js` hace:
```js
var banner = document.getElementById('pwa-banner');
if (banner) banner.classList.add('show');
```
El CSS define `#pwa-banner.show { display: flex }`, pero el **inline style** `display:none` tiene especificidad máxima y no puede ser sobreescrito por una clase CSS. El banner nunca aparece.

Adicionalmente el CSS tiene un bloque fijo `#pwa-banner { position: fixed; bottom: 0; ... }` para un elemento de posición fija, pero el elemento real está embebido dentro del contenido del selector. Son dos conceptos distintos colisionando en el mismo ID.

---

#### BUG-07 — `S._nombreConfirmado` no se limpia al cambiar de examen ★ BAJO
**Archivo:** `js/student.js:98-103`

`iniciarExamen()` no resetea `S._nombreConfirmado`. Si un estudiante confirma su identidad en el Examen A, vuelve al listado y abre el Examen B (también con `validar_lista: true`), el nombre confirmado del Examen A persiste. El campo se limpia en `confirmarRegistro` al final, pero solo después de llegar al comprobante.

---

#### BUG-08 — Si `submitExamen` falla, el timer ya fue detenido y no puede reiniciarse ★ MEDIO
**Archivo:** `js/student.js:581-605`

`stopTimer()` se llama **antes** de la llamada async a Supabase. Si la red falla y `submitExamen` retorna con error (toast), el estudiante queda en la vista `examen` sin timer visible, no sabe si puede reintentar y no hay botón de reintento explícito.

---

#### BUG-09 — `nameMatch` retorna `true` para nombres con todas palabras ≤ 2 chars ★ MEDIO
**Archivo:** `js/utils.js:65-69`

```js
var dbWords = normalizeName(dbName).split(' ').filter(w => w.length > 2);
var inWords = normalizeName(inputName).split(' ').filter(w => w.length > 2);
var matches = ...
return matches.length >= Math.min(2, inWords.length);
```
Si `inWords` es array vacío (todas las palabras del input tienen ≤ 2 chars), entonces `Math.min(2, 0) = 0` y `matches.length >= 0` es siempre `true`. Cualquier input trivial como "Al" o "AB" validaría con cualquier estudiante de la lista.

---

#### BUG-10 — Redeclaración de `var qi` dentro del mismo scope en `goToQ` ★ BAJO
**Archivo:** `js/student.js:411-413`

```js
if (el.id.startsWith('txt_')) { var qi = parseInt(...); ... }
if (el.id.startsWith('bl_'))  { var p = ...; var qi = parseInt(p[1]), bi = ...; ... }
```
Con `var`, ambas declaraciones son hoisted al scope de la función flecha. Cuando un elemento `txt_` es procesado, la segunda `var qi` queda como declaración duplicada. Funciona porque los dos `if` son mutuamente excluyentes por el prefijo, pero es confuso.

---

### 1.3 Panel de administración

#### BUG-11 — Export Word: `lectura` tipo produce `[undefined | 0 pts]` ★ ALTO
**Archivo:** `js/admin.js:545, 554`

```js
var TIPO = {multiple:'Opción múltiple', texto:'Respuesta abierta', vf:'Verdadero/Falso',
            completar:'Completar', ordenar:'Ordenar', escala:'Escala 1-5'};
// 'lectura' no está en TIPO
doc += (i+1)+'. ['+TIPO[q.tipo]+' | '+(q.puntos||0)+' pts]\n';
// → "1. [undefined | 0 pts]"
```

---

#### BUG-12 — `guardarEstudiante` omite `activo: true` en el payload ★ MEDIO
**Archivo:** `js/admin.js:208-215`

`procesarCSV` incluye `activo: true` en cada fila, pero `guardarEstudiante` no:
```js
var { error } = await rpcAdmin('admin_upsert_estudiantes', {
    p_filas: [{grado, seccion, numero_orden: orden, nombre}]  // sin activo
});
```
Si el RPC o la tabla tiene `activo DEFAULT false`, los estudiantes agregados manualmente no aparecerán en las búsquedas de validación (`eq('activo', true)`).

---

#### BUG-13 — Double `style` attribute en el modal de revisión ★ BAJO
**Archivo:** `js/admin.js:350`

```html
<div id="revision-error" style="display:none" class="warn-box" style="flex:1"></div>
```
Dos atributos `style` en el mismo elemento. El parser HTML solo aplica el primero; `flex:1` se ignora.

---

#### BUG-14 — Múltiples overlays de `verIntentos` pueden apilarse ★ BAJO
**Archivo:** `js/admin.js:570-621`

Si el admin hace clic en "Ver intentos" mientras ya hay un overlay abierto, se crea un segundo overlay encima del primero. No hay cleanup previo.

---

#### BUG-15 — `buildExamenesTab` lista grados hardcodeados ★ BAJO
**Archivo:** `js/admin.js:84`

```js
['2do','4to','5to','6to'].forEach(grado => { ... });
```
Si se habilita `1ro` o `3ro` en `GRADOS_CONFIG`, sus exámenes existirán en la BD pero **no aparecerán en el panel admin**.

---

#### BUG-16 — `procesarImportJSON` no valida campos de cada pregunta ★ BAJO
**Archivo:** `js/admin.js:529-540`

Solo valida que existan `titulo` y `preguntas[]`. Una pregunta sin `tipo` se guardará en la BD y al renderizarse en el examen no producirá contenido interactivo (el `switch` de `renderPregunta` no matchea ningún case).

---

### 1.4 Otros bugs

#### BUG-17 — Respuestas de `texto` en el Excel no se decodifican ★ BAJO
**Archivo:** `js/admin.js:394`

```js
row.push(v===undefined ? '' : (typeof v==='object' ? JSON.stringify(v) : String(v)));
```
Las respuestas `completar` (tipo `object`) se serializan como JSON dentro de la celda Excel, por ejemplo `{"0":"Iglesia","1":"pecado original"}`. Es legible pero poco amigable para el docente.

---

## 2. ANÁLISIS DE SEGURIDAD

### 2.1 ¿Es posible suplantar a otro estudiante hoy?

**Sí, con bajo esfuerzo en modo sin validar_lista:**

El flujo sin `validar_lista` pide nombre + número de orden + sección. La validación del lado cliente es `nameMatch`, que:
- Es permisiva (subcadenas, prefijos)
- Es bypasseable desde consola con `S._nombreConfirmado = "Nombre Víctima"`
- No hay rate limiting en la verificación del nombre

Un estudiante que conozca el número de orden de un compañero puede intentar escribir variantes del nombre hasta que `nameMatch` devuelva `true`. O simplemente abrir DevTools y asignar directamente `S._nombreConfirmado`.

**Con `validar_lista`: riesgo reducido pero no eliminado.** El sistema muestra el nombre real y pide confirmación ("¿Eres tú?"). Un estudiante malintencionado que conoce el número de orden de otro puede hacer clic en "Sí, soy yo". La primera persona en enviar el examen "gana" (hay detección de duplicados por orden+sección).

### 2.2 ¿Puede un estudiante abrir el examen en dos dispositivos?

**Parcialmente bloqueado** por `public_registrar_inicio`. Al registrar el inicio, si ya existe un registro para ese `(examen_id, numero_orden, grado, seccion)`, el RPC debería devolver `{ok: false}`.

Sin embargo, existe una **ventana de race condition**: si dos dispositivos lanzan la petición de registro simultáneamente, ambas podrían pasar antes de que la primera escriba en la BD. La efectividad depende de si hay una restricción `UNIQUE` en la BD (no visible en el código cliente). Sin esa restricción a nivel de BD, dos dispositivos simultáneos pueden registrar dos inicios y luego ambos enviar respuestas.

### 2.3 ¿El PIN de admin está suficientemente protegido?

**No. Tiene tres problemas críticos:**

**a) Hash sin sal, SHA-256 simple:**
```js
var hash = await sha256(pin);  // sin salt
var { data } = await sb.from('admin_config').select('pin_hash').single();
```
La tabla `admin_config` es consultada con la clave anon (pública). Si RLS no la protege, cualquier persona puede obtener el hash. SHA-256 de un PIN de 4-6 dígitos es trivialmente reversible con una tabla arcoíris precomputada (solo 10^6 posibilidades = ~1 segundo de cómputo).

**b) Sin rate limiting en intentos:**
No hay ningún límite de intentos de PIN. Un atacante puede automatizar 10.000 intentos en segundos desde la consola:
```js
for (let i=0; i<9999; i++) { checkPin(String(i).padStart(4,'0')); }
```

**c) `S.pinHash` persistido en estado JS:**
El hash del PIN se guarda en `S.pinHash` durante la sesión y se envía en cada llamada RPC admin. Si un atacante llegara a ejecutar JS en la página (XSS), obtendría el hash directamente de `S`.

### 2.4 ¿Qué datos sensibles están expuestos?

| Dato | Dónde | Riesgo |
|------|-------|--------|
| `SUPABASE_URL` y `SUPABASE_ANON` key | `js/config.js` línea 3-4 | Inevitable (es client-side); cualquiera puede hacer queries directas a Supabase |
| **Respuestas correctas de exámenes** (`q.correcta`) | `js/student.js:536` — cargadas vía `select('*')` | **CRÍTICO**: un estudiante puede abrir la consola y ejecutar `sb.from('examenes').select('*')` para ver todas las respuestas correctas ANTES de enviar |
| Nombres completos de estudiantes | `estudiantes_lista` — accesible con anon key si RLS lo permite | Depende de la política RLS en Supabase |
| Hash del PIN de admin | `admin_config` — accesible con anon key si RLS lo permite | Ver punto 2.3a |

**El más grave:** las respuestas correctas de tipo `multiple` (`correcta: "B"`), `vf` (`correcta: "V"/"F"`), el orden correcto de `ordenar` (`items` en orden), y las respuestas de `completar` (`respuestas: [...]`) están todas en el payload que recibe el navegador del estudiante. Un estudiante mínimamente técnico puede verlas.

---

## 3. PWA — Estado actual

### 3.1 ¿El manifest está completo?

**Parcialmente.** Lo que falta:

| Campo | Estado | Observación |
|-------|--------|-------------|
| `name` / `short_name` | ✅ | Correcto |
| `icons` 192 + 512 | ✅ | Presente |
| `purpose: "any maskable"` | ⚠️ | Ambos iconos comparten propósito en una sola entrada. La especificación recomienda entradas separadas para `"any"` y `"maskable"`. Algunos navegadores pueden ignorar el icono enmascarable. |
| `screenshots` | ⚠️ | Array vacío. Requerido por Chrome para el criterio de instalabilidad "enhanced". Sin screenshots no aparece el diálogo de instalación mejorado. |
| `shortcuts` | ❌ | No definido. Permitiría acceso rápido desde el ícono. |
| `related_applications` | ❌ | No crítico |
| `prefer_related_applications` | ❌ | No crítico |

### 3.2 ¿El service worker cachea correctamente?

**Incompleto.** El array `STATIC` en `sw.js` no incluye los iconos:

```js
const STATIC = [
  './', './index.html',
  './css/styles.css',
  './js/config.js', './js/utils.js',
  './js/student.js', './js/admin.js', './js/app.js',
  './manifest.json'
  // ❌ Faltan: 'icons/icon-192.png', 'icons/icon-512.png'
  // ❌ Faltan: fuentes de Google Fonts
];
```

Consecuencias:
- Offline: el ícono de la app no carga → la pantalla de inicio de la PWA instalada muestra imagen rota o genérica
- Offline: la fuente `Inter` (Google Fonts) no carga → el texto cae a `Arial` (el fallback definido)
- Las llamadas a Supabase son `network-only` — correcto, no se deben cachear
- No hay **página de fallback offline** — si el usuario abre la app sin internet y el caché falla, verá el error del navegador

Hay un problema conceptual: `'./'` y `'./index.html'` probablemente resuelven al mismo recurso; se cachea dos veces innecesariamente.

### 3.3 ¿Es instalable en móvil hoy?

**Android: sí, con limitaciones.**
- Cumple los criterios mínimos: HTTPS (asumido), SW registrado, manifest con display standalone, íconos
- El banner de instalación automático tiene el BUG-06 descrito: nunca aparece porque el inline `style="display:none"` sobreescribe la clase `.show`
- El usuario debería ver el botón de instalación del navegador en la barra de dirección

**iOS (Safari): instalación manual.**
- `apple-mobile-web-app-capable` y `apple-touch-icon` están configurados ✅
- iOS no muestra prompt automático; el usuario debe usar "Compartir → Agregar a pantalla de inicio"
- Sin screenshot, la previsulaización del ícono en iOS puede ser genérica

### 3.4 ¿Qué falta para PWA completa?

1. **Página de fallback offline** (`/offline.html`) — mostrar cuando no hay red y el recurso no está en caché
2. **Iconos cacheados** en el SW
3. **Screenshots en manifest** (mínimo 1 para Chrome)
4. **Separar propósito del ícono**: una entrada `"purpose": "any"` y otra `"purpose": "maskable"`
5. **Fuente cacheada** o usar fuente del sistema para resiliencia offline
6. **Estrategia de actualización del SW**: actualmente el SW se actualiza solo cuando cambia el archivo `sw.js`, pero no notifica al usuario. Una notificación de "nueva versión disponible" mejoraría la experiencia.
7. **Background Sync**: si el estudiante envía el examen sin red, la respuesta se pierde. Un service worker con Background Sync podría encolar el envío.

---

## 4. PROPUESTAS DE MEJORA (priorizadas)

### CRÍTICO

| # | Propuesta | Complejidad | Impacto |
|---|-----------|-------------|---------|
| P1 | **Ocultar respuestas correctas del cliente**: mover la calificación automática al servidor (función RPC en Supabase) y no enviar `correcta`, `respuestas`, ni `items` en orden correcto al navegador. El cliente envía respuestas crudas y el servidor califica. | Complejo | Elimina acceso a respuestas desde consola |
| P2 | **Rate limiting y bloqueo en login de admin**: añadir un contador de intentos fallidos (localStorage + timestamp). Bloquear por 30 segundos tras 5 intentos fallidos. | Simple | Previene fuerza bruta del PIN |
| P3 | **Verificar RLS de `admin_config`**: asegurarse de que la tabla `admin_config` no sea legible con la clave anon. Si lo es, añadir `salt` al hash del PIN (al menos concatenar un secreto fijo antes de hashear) y agregar el salt al hash almacenado. | Medio | Evita obtención del hash del PIN |

### ALTO

| # | Propuesta | Complejidad | Impacto |
|---|-----------|-------------|---------|
| P4 | **BUG-01 fix — Ordenar**: inicializar `S.resp[i] = [...q.items]` en `entrarAlExamen` para preguntas tipo `ordenar`. | Simple | Evita 0 pts injusto por no arrastrar |
| P5 | **BUG-11 fix — Export Word**: agregar `lectura` a `TIPO` o excluir lecturas del loop de export Word. | Simple | Evita `undefined` en el documento |
| P6 | **BUG-06 fix — Banner PWA**: cambiar el inline `style="display:none"` del `#pwa-banner` a una clase CSS, o remover el inline style y dejar que el CSS controle la visibilidad. Unificar el concepto de banner (el CSS tiene un banner fijo; el HTML inyecta uno inline). | Simple | El botón "Instalar" funciona |
| P7 | **BUG-12 fix — `guardarEstudiante`**: agregar `activo: true` al payload del upsert manual. | Simple | Estudiantes manuales aparecen en la validación |

### MEDIO

| # | Propuesta | Complejidad | Impacto |
|---|-----------|-------------|---------|
| P8 | **BUG-02 fix — `completar` sin respuestas**: cambiar `item.pts = pts` por `item.pts = 0` (o marcar como `pendiente`) cuando no hay respuestas definidas. | Simple | Evita puntos regalados |
| P9 | **BUG-09 fix — `nameMatch` con nombre vacío**: agregar `if (!inWords.length) return false` antes de calcular coincidencias. | Simple | Cierra bypas trivial de validación de nombre |
| P10 | **PWA: cachear iconos y agregar fallback offline** en `sw.js`. Agregar `'icons/icon-192.png'`, `'icons/icon-512.png'` a `STATIC`. Crear `offline.html` mínimo. | Simple | App funcional sin red (al menos visualmente) |
| P11 | **Retry en submit fallido**: si `submitExamen` falla por error de red, mostrar un botón "Reintentar envío" en lugar de dejar al estudiante varado. Conservar `S.resp` en `sessionStorage` como respaldo. | Medio | Evita pérdida de respuestas por error de red |
| P12 | **BUG-14 fix — `verIntentos` overlay**: verificar y remover overlay existente antes de crear uno nuevo. | Simple | Evita overlays apilados |
| P13 | **Documentar comportamiento de `completar` fuzzy match** para el admin: añadir una nota en la UI de creación de examen explicando las reglas de coincidencia parcial. | Simple | Evita sorpresas pedagógicas |

### BAJO

| # | Propuesta | Complejidad | Impacto |
|---|-----------|-------------|---------|
| P14 | **BUG-15 fix — grados hardcodeados**: reemplazar el array `['2do','4to','5to','6to']` por `GRADOS_CONFIG.filter(g => g.disponible).map(g => g.nivel)`. | Simple | El panel admin escala automáticamente |
| P15 | **BUG-16 fix — validar campos al importar JSON**: agregar validación de `tipo` en cada pregunta importada. | Simple | Evita preguntas corruptas |
| P16 | **BUG-13 fix — doble `style` en modal revisión**: consolidar en un único atributo `style`. | Simple | Corrección HTML |
| P17 | **Manifest: screenshots y propósito de icono separado**: agregar 1-2 screenshots y separar las entradas de icono en `"any"` y `"maskable"`. | Simple | Mejor instalabilidad y presentación en tiendas |
| P18 | **Excel de respuestas: decodificar tipo `completar`**: en el export Excel, expandir el objeto `{0:'x',1:'y'}` a columnas separadas o a texto legible "1:x / 2:y". | Medio | Mejor experiencia para el docente al revisar |
| P19 | **Usar el modal CSS estándar en `revisarTexto`**: refactorizar el overlay de revisión para reutilizar `.modal-overlay` / `.modal-box`. | Medio | Consistencia visual y scroll correcto en móvil |
| P20 | **Notificación de actualización del SW**: cuando el SW detecta una nueva versión, mostrar un banner "Nueva versión disponible — Recargar". | Medio | Evita que usuarios usen versiones viejas cacheadas |

---

## Resumen ejecutivo

| Categoría | Cantidad | Nivel más grave |
|-----------|----------|-----------------|
| Bugs de calificación | 5 | ALTO (BUG-01) |
| Bugs de flujo estudiante | 5 | ALTO (BUG-06) |
| Bugs de panel admin | 5 | ALTO (BUG-11, BUG-12) |
| Vulnerabilidades de seguridad | 4 | CRÍTICO |
| Gaps de PWA | 6 | MEDIO |

**Prioridad inmediata antes del próximo examen:**
1. Verificar que las respuestas correctas no sean accesibles vía consola (P1 — o al menos alertar al equipo)
2. Corregir BUG-01 (ordenar sin arrastrar → 0 pts injusto)
3. Corregir BUG-06 (banner PWA no muestra)
4. Corregir BUG-11 (Word export crashea con lectura)
5. Corregir BUG-12 (estudiantes manuales sin `activo: true`)
