-- =============================================================
-- Bloque 1 — Clave obligatoria para acceder a un grado
-- Exámenes Santo Cura de Ars · Portal FIHR
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- =============================================================
--
-- PROBLEMA QUE RESUELVE:
-- Hasta ahora el flujo de "validar_lista" en el examen leía la
-- columna estudiantes_lista.clave directamente con la clave anon
-- (`sb.from('estudiantes_lista').select('...,clave')`) y la
-- comparaba en el navegador. Cualquier visitante podía leer esa
-- clave desde la consola sin escribirla. Además, no existía
-- ningún gate de clave para simplemente VER la lista de exámenes
-- o el contenido de estudio (portal de clases) de un grado.
--
-- SOLUCIÓN:
-- Una función SECURITY DEFINER que recibe grado+sección+número de
-- orden+clave en texto plano, compara todo DENTRO de Postgres, y
-- solo devuelve {ok:true, nombre} si la clave es correcta. La
-- clave real de estudiantes_lista nunca sale hacia el cliente.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- RPC verificar_acceso_grado
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verificar_acceso_grado(
  p_grado        TEXT,
  p_seccion      TEXT,
  p_numero_orden INTEGER,
  p_clave        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
  v_clave  TEXT;
BEGIN
  SELECT nombre, clave INTO v_nombre, v_clave
  FROM estudiantes_lista
  WHERE grado = p_grado
    AND seccion = p_seccion
    AND numero_orden = p_numero_orden
    AND activo = true
  LIMIT 1;

  IF v_nombre IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  IF v_clave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_clave_asignada');
  END IF;

  IF v_clave <> UPPER(TRIM(COALESCE(p_clave, ''))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clave_incorrecta');
  END IF;

  RETURN jsonb_build_object('ok', true, 'nombre', v_nombre);
END;
$$;

GRANT EXECUTE ON FUNCTION verificar_acceso_grado(TEXT, TEXT, INTEGER, TEXT)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- Bloqueo de lectura directa de estudiantes_lista.clave
-- ─────────────────────────────────────────────────────────────
-- Hasta ahora estudiantes_lista era legible por completo con la
-- clave anon (sin RLS, sin restricción de columnas) — el mismo
-- problema que tenía admin_config antes del fix del PIN de admin.
-- El único motivo por el que un visitante no veía las claves es
-- que el código de la app no las mostraba; cualquiera podía leerlas
-- igual desde la consola del navegador con, por ejemplo:
--   sb.from('estudiantes_lista').select('clave')
--
-- Fix: RLS habilitado + permisos por columna. anon/authenticated
-- solo pueden leer id/nombre/numero_orden/grado/seccion/activo de
-- estudiantes activos (lo que ya usa el flujo público en
-- js/student.js). La columna `clave` deja de ser legible en forma
-- directa; solo verificar_acceso_grado() y las funciones admin_*
-- (todas SECURITY DEFINER, dueño postgres) pueden leerla, porque
-- esas funciones ignoran RLS y permisos de columna.
--
-- El panel admin (js/admin.js → buildListaTab) deja de leer la
-- tabla directo con select('*') y pasa a usar el nuevo RPC
-- admin_listar_estudiantes, con el mismo patrón p_pin_hash que el
-- resto de las funciones admin_*.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE estudiantes_lista ENABLE ROW LEVEL SECURITY;

-- Revoca el acceso de tabla completa (heredado por defecto en
-- Supabase) y otorga explícitamente solo lo necesario para el
-- flujo público — sin la columna `clave`.
REVOKE ALL ON estudiantes_lista FROM anon, authenticated;
GRANT SELECT (id, nombre, numero_orden, grado, seccion, activo)
  ON estudiantes_lista TO anon, authenticated;

-- Política de fila: por SELECT directo, solo estudiantes activos
-- (igual al filtro .eq('activo', true) que ya usaba el cliente,
-- ahora también aplicado server-side).
CREATE POLICY "select_estudiantes_publico" ON estudiantes_lista
  FOR SELECT TO anon, authenticated
  USING (activo = true);


-- ─────────────────────────────────────────────────────────────
-- RPC admin_listar_estudiantes
-- Reemplaza la lectura directa select('*') que hacía el panel
-- admin. Devuelve TODAS las columnas (incluida `clave`), pero solo
-- si el token de sesión admin (p_pin_hash) es válido.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_listar_estudiantes(p_pin_hash TEXT)
RETURNS SETOF estudiantes_lista
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
    SELECT * FROM estudiantes_lista
    ORDER BY grado, seccion, numero_orden;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_listar_estudiantes(TEXT) TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución:
--
--   1. Con un estudiante real que YA tenga clave asignada:
--        select verificar_acceso_grado('6to','A',1,'CLAVE-REAL');
--      Debe devolver {"ok": true, "nombre": "..."}.
--
--   2. Con la clave equivocada:
--        select verificar_acceso_grado('6to','A',1,'XXXXXX');
--      Debe devolver {"ok": false, "error": "clave_incorrecta"}.
--
--   3. Con un estudiante sin clave asignada (columna clave IS NULL):
--        select verificar_acceso_grado('6to','A',2,'CUALQUIERA');
--      Debe devolver {"ok": false, "error": "sin_clave_asignada"}.
--
--   4. Con un número de orden que no existe en esa sección:
--        select verificar_acceso_grado('6to','Z',99,'CUALQUIERA');
--      Debe devolver {"ok": false, "error": "no_encontrado"}.
--
--   5. Confirmar que la columna clave ya NO es legible directo con
--      la clave anon (ejecutar esto en un cliente REST/JS con la
--      anon key, NO en el SQL Editor — ahí corres como postgres y
--      los GRANT/REVOKE no aplican):
--        sb.from('estudiantes_lista').select('clave')
--      Debe devolver error de permisos (0 filas / "permission denied
--      for column clave"), NO los valores reales.
--
--   6. Confirmar que el panel admin sigue viendo la lista completa
--      (con clave) después de iniciar sesión con el PIN — usa
--      admin_listar_estudiantes internamente.
-- =============================================================
