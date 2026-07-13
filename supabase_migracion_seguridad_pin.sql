-- =============================================================
-- Migración Seguridad — PIN de admin
-- Exámenes Santo Cura de Ars
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- Ejecutar los bloques EN ORDEN. Cada bloque es idempotente.
-- =============================================================
--
-- PROBLEMA QUE RESUELVE:
-- Hasta ahora, el navegador leía admin_config.pin_hash directamente
-- con la clave anon (`sb.from('admin_config').select('pin_hash')`)
-- y comparaba el hash localmente. Cualquier visitante podía ejecutar
-- esa misma línea en la consola del navegador para obtener el hash
-- SIN escribir el PIN, y usarlo para llamar cualquier función
-- admin_* directamente. El límite de "5 intentos / 30s" vivía en
-- localStorage, así que se evadía borrando el storage.
--
-- SOLUCIÓN:
-- 1. La tabla admin_config deja de ser legible desde el cliente
--    (RLS sin políticas para anon/authenticated).
-- 2. pin_hash deja de ser "el hash permanente del PIN" y pasa a ser
--    un TOKEN DE SESIÓN ROTATIVO: se genera nuevo en cada login
--    exitoso, y todas las funciones admin_* existentes (que ya
--    comparan p_pin_hash contra admin_config.pin_hash) siguen
--    funcionando SIN modificarlas — ahora solo aceptan el token
--    vigente, no el PIN en sí.
-- 3. El hash real del PIN se guarda aparte en pin_hash_real, y solo
--    se usa dentro de admin_login() (SECURITY DEFINER, nunca sale
--    de Postgres).
-- 4. Rate limiting y bloqueo de 30s tras 5 intentos ahora viven en
--    la tabla (columnas failed_attempts / locked_until), no en
--    localStorage — no se puede evadir borrando el navegador.
--
-- IMPORTANTE — revisar manualmente en el dashboard de Supabase:
-- este script solo cubre admin_config. Revisar también las
-- políticas RLS de `examenes` y `estudiantes_lista` (Authentication
-- → Policies) para confirmar que no exponen datos que no deberían
-- (ej. respuestas correctas antes de tiempo, o datos de estudiantes
-- sin restricción).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 1: Extensión pgcrypto (hash y tokens aleatorios)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 2: Columnas nuevas en admin_config
-- pin_hash_real   → hash permanente del PIN (nunca sale de Postgres)
-- failed_attempts → intentos fallidos consecutivos
-- locked_until    → si no es NULL y es futuro, login bloqueado
-- ─────────────────────────────────────────────────────────────
ALTER TABLE admin_config
  ADD COLUMN IF NOT EXISTS pin_hash_real   TEXT,
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until    TIMESTAMPTZ;

-- Copia el hash actual a pin_hash_real UNA SOLA VEZ (no pisa si ya corriste esto antes).
UPDATE admin_config
SET pin_hash_real = pin_hash
WHERE pin_hash_real IS NULL;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 3: Bloquear lectura/escritura directa de admin_config
-- Mismo patrón ya usado en sesiones_activas (migración ronda 2):
-- las funciones SECURITY DEFINER corren con privilegios del dueño
-- (postgres), que ignora RLS, así que siguen funcionando igual.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
-- Sin políticas para anon/authenticated → SELECT/INSERT/UPDATE/DELETE
-- directos desde el navegador quedan denegados por completo.


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 4: RPC admin_login
-- Recibe el PIN en texto plano, lo hashea DENTRO de Postgres,
-- lo compara contra pin_hash_real, aplica rate limiting server-side
-- y — si es correcto — genera un token de sesión rotativo nuevo.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_login(p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pin_hash_real TEXT;
  v_locked_until  TIMESTAMPTZ;
  v_hash          TEXT;
  v_token         TEXT;
  v_intentos      INTEGER;
BEGIN
  SELECT pin_hash_real, locked_until INTO v_pin_hash_real, v_locked_until
  FROM admin_config LIMIT 1;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'bloqueado',
      'segundos', CEIL(EXTRACT(EPOCH FROM (v_locked_until - NOW())))
    );
  END IF;

  v_hash := encode(digest(p_pin::bytea, 'sha256'), 'hex');

  IF v_pin_hash_real IS NOT NULL AND v_hash = v_pin_hash_real THEN
    v_token := encode(gen_random_bytes(32), 'hex');
    -- WHERE true: admin_config es tabla de una sola fila, pero Supabase
    -- bloquea UPDATE sin WHERE (pg_safeupdate)
    UPDATE admin_config
    SET pin_hash = v_token, failed_attempts = 0, locked_until = NULL
    WHERE true;
    RETURN jsonb_build_object('ok', true, 'token', v_token);
  END IF;

  -- WHERE true: admin_config es tabla de una sola fila, pero Supabase
  -- bloquea UPDATE sin WHERE (pg_safeupdate)
  UPDATE admin_config
  SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= 5
                          THEN NOW() + INTERVAL '30 seconds'
                          ELSE locked_until END
  WHERE true
  RETURNING failed_attempts INTO v_intentos;

  IF v_intentos >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bloqueado', 'segundos', 30);
  END IF;

  RETURN jsonb_build_object(
    'ok', false, 'error', 'pin_incorrecto',
    'intentos_restantes', GREATEST(0, 5 - v_intentos)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_login(TEXT) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 5: RPC admin_validar_sesion
-- Usada al recargar la página para confirmar que el token guardado
-- en sessionStorage sigue siendo el vigente (sin exponer pin_hash).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_validar_sesion(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  RETURN jsonb_build_object('ok', v_token IS NOT NULL AND v_hash IS NOT NULL AND v_hash = v_token);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_validar_sesion(TEXT) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 6: RPC admin_logout
-- Invalida el token actual de inmediato (rota pin_hash a un valor
-- aleatorio inutilizable), para que un token que haya quedado
-- guardado en un dispositivo compartido deje de servir apenas el
-- admin presiona "Salir".
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_logout(p_pin_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;
  -- WHERE true: admin_config es tabla de una sola fila, pero Supabase
  -- bloquea UPDATE sin WHERE (pg_safeupdate)
  UPDATE admin_config SET pin_hash = encode(gen_random_bytes(32), 'hex')
  WHERE true;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_logout(TEXT) TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución:
--
--   1. Confirmar que la lectura directa quedó bloqueada (debe dar
--      0 filas o error de permisos si se ejecuta con la clave anon):
--        select pin_hash from admin_config;
--
--   2. Confirmar que el login funciona (reemplazar 1234 por el PIN real):
--        select admin_login('1234');
--      Debe devolver {"ok": true, "token": "..."} la primera vez,
--      y {"ok": false, "error": "pin_incorrecto", ...} con un PIN malo.
--
--   3. Confirmar que a la 5ta falla seguida bloquea 30 segundos:
--        select admin_login('0000'); -- repetir 5 veces
--
--   4. Revisar manualmente en el dashboard (Authentication → Policies)
--      las políticas RLS de `examenes` y `estudiantes_lista`.
--
-- NOTA: si al crear otra función admin_* con UPDATE aparece el error
-- "UPDATE requires a WHERE clause" (protección pg_safeupdate de
-- Supabase), el fix es el mismo patrón usado arriba en admin_login/
-- admin_logout: agregar "WHERE true" al UPDATE cuando la tabla es de
-- una sola fila y no hay una columna real por la cual filtrar.
-- =============================================================
