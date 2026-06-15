-- =============================================================
-- Migración Ronda 2 — Exámenes Santo Cura de Ars
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- Ejecutar los bloques EN ORDEN. Cada bloque es idempotente
-- (usa IF NOT EXISTS / CREATE OR REPLACE) para poder re-ejecutar
-- sin errores si algo falló a mitad.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 1: Columna clave en estudiantes_lista
-- Permite asignar una clave personal a cada estudiante.
-- Si la columna es NULL, el estudiante entra sin clave.
-- Si tiene valor, debe ingresarla después de confirmar su nombre.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE estudiantes_lista
  ADD COLUMN IF NOT EXISTS clave TEXT;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 2: Columna cambios_pestana en respuestas_examenes
-- Guarda cuántas veces el estudiante cambió de pestaña/ventana
-- durante el examen. El cliente lo registra con visibilitychange.
-- DEFAULT 0 → no afecta filas existentes.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE respuestas_examenes
  ADD COLUMN IF NOT EXISTS cambios_pestana INTEGER DEFAULT 0;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 3: Tabla sesiones_activas
-- Registra exámenes en curso. Al iniciar se inserta un token UUID
-- por estudiante. Al entregar se elimina. El UNIQUE en
-- (examen_id, numero_orden, seccion) impide que el mismo
-- estudiante tenga dos sesiones paralelas.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones_activas (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  examen_id     TEXT         NOT NULL,
  numero_orden  INTEGER      NOT NULL,
  seccion       TEXT         NOT NULL,
  token         TEXT         NOT NULL,
  inicio        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT sesiones_activas_uq UNIQUE (examen_id, numero_orden, seccion)
);

-- Índice para búsqueda rápida por token al finalizar o limpiar sesiones
CREATE INDEX IF NOT EXISTS sesiones_activas_token_idx
  ON sesiones_activas (token);

-- RLS activado: el cliente anon no puede leer/escribir directamente.
-- Las funciones SECURITY DEFINER de abajo omiten RLS.
ALTER TABLE sesiones_activas ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 4: RPC public_iniciar_sesion
-- Llamada al presionar "Comenzar examen" (sin pin de admin).
-- Lógica:
--   · Si existe sesión con OTRO token → {ok: false}  (otro dispositivo)
--   · Si no existe sesión             → inserta y devuelve {ok: true}
--   · Si existe con el MISMO token    → ya registrado, {ok: true}
-- El FOR UPDATE SKIP LOCKED evita condición de carrera si dos
-- pestañas intentan iniciar al mismo tiempo.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public_iniciar_sesion(
  p_examen_id    TEXT,
  p_numero_orden INTEGER,
  p_seccion      TEXT,
  p_token        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_existente TEXT;
BEGIN
  SELECT token INTO v_token_existente
  FROM sesiones_activas
  WHERE examen_id    = p_examen_id
    AND numero_orden = p_numero_orden
    AND seccion      = p_seccion
  FOR UPDATE SKIP LOCKED;

  IF v_token_existente IS NOT NULL AND v_token_existente <> p_token THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF v_token_existente IS NULL THEN
    INSERT INTO sesiones_activas (examen_id, numero_orden, seccion, token, inicio)
    VALUES (p_examen_id, p_numero_orden, p_seccion, p_token, NOW());
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public_iniciar_sesion(TEXT, INTEGER, TEXT, TEXT)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 5: RPC public_finalizar_sesion
-- Llamada al entregar el examen (fire-and-forget desde el cliente).
-- Elimina la fila de sesiones_activas por token para que el
-- estudiante pueda reingresar si necesita (por ejemplo, un reenvío).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public_finalizar_sesion(
  p_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM sesiones_activas WHERE token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public_finalizar_sesion(TEXT)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 6: RPC public_registrar_cambios_pestana
-- Actualiza cambios_pestana en la respuesta ya guardada.
-- Se llama solo cuando S.cambiosPestana > 0 al momento de entregar.
-- p_respuesta_id es el id devuelto por public_enviar_respuesta.
--
-- NOTA: la comparación id::TEXT = p_respuesta_id funciona tanto
-- si el PK de respuestas_examenes es BIGINT como UUID.
-- Si el PK es BIGINT y prefieres tipado estricto, cambia el
-- parámetro a BIGINT y quita el ::TEXT.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public_registrar_cambios_pestana(
  p_respuesta_id TEXT,
  p_cambios      INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_respuesta_id IS NULL OR p_respuesta_id = '' THEN RETURN; END IF;
  UPDATE respuestas_examenes
  SET cambios_pestana = p_cambios
  WHERE id::TEXT = p_respuesta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public_registrar_cambios_pestana(TEXT, INTEGER)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 7: RPC admin_actualizar_clave
-- Actualiza o borra la clave de un estudiante individual.
-- Llamada desde admin → lista → icono de edición inline.
-- p_clave = NULL o '' elimina la clave (estudiante sin clave).
--
-- NOTA: si el PK de estudiantes_lista es UUID en tu proyecto,
-- cambia el tipo de p_id a UUID.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_actualizar_clave(
  p_pin_hash TEXT,
  p_id       BIGINT,
  p_clave    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  -- NULLIF convierte cadena vacía en NULL, borrando la clave
  UPDATE estudiantes_lista
  SET clave = NULLIF(TRIM(UPPER(p_clave)), '')
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_actualizar_clave(TEXT, BIGINT, TEXT)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 8: RPC admin_actualizar_claves
-- Actualiza claves de múltiples estudiantes en una sola llamada.
-- Llamada desde "🔑 Generar claves" en el panel admin.
-- p_filas es un array JSON: [{"id": 1, "clave": "AB3K9Z"}, ...]
--
-- NOTA: si el PK de estudiantes_lista es UUID, cambia el cast
-- (v_item->>'id')::BIGINT a (v_item->>'id')::UUID.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_actualizar_claves(
  p_pin_hash TEXT,
  p_filas    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash  TEXT;
  v_item  JSONB;
  v_count INTEGER := 0;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_filas)
  LOOP
    UPDATE estudiantes_lista
    SET clave = UPPER(TRIM(v_item->>'clave'))
    WHERE id = (v_item->>'id')::BIGINT;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'actualizadas', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_actualizar_claves(TEXT, JSONB)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 9: RPC admin_limpiar_sesiones
-- Elimina todas las sesiones activas de un examen.
-- Útil cuando un estudiante quedó bloqueado por una sesión
-- colgada (cerró el navegador sin entregar).
-- Devuelve cuántas sesiones fueron eliminadas.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_limpiar_sesiones(
  p_pin_hash  TEXT,
  p_examen_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash  TEXT;
  v_count INTEGER;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  DELETE FROM sesiones_activas WHERE examen_id = p_examen_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'eliminadas', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_limpiar_sesiones(TEXT, TEXT)
  TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución:
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name IN ('estudiantes_lista','respuestas_examenes','sesiones_activas')
--   ORDER BY table_name, ordinal_position;
--
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_type = 'FUNCTION'
--     AND routine_name IN (
--       'public_iniciar_sesion','public_finalizar_sesion',
--       'public_registrar_cambios_pestana','admin_actualizar_clave',
--       'admin_actualizar_claves','admin_limpiar_sesiones'
--     );
-- =============================================================
