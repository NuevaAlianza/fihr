-- =============================================================
-- Bloque 8 — Admin más ágil (resumen "Necesita tu atención")
-- Exámenes Santo Cura de Ars · Portal FIHR
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- =============================================================
--
-- RPC admin_resumen_atencion: dos conteos que el admin necesita ver
-- de entrada al abrir el panel.
--
-- "sin_clave" necesita esta función porque, desde el Bloque 1,
-- estudiantes_lista.clave ya NO es legible directo con la clave
-- anon (RLS + permisos por columna) — ni siquiera para filtrar
-- "IS NULL", así que no se puede calcular con una query directa
-- desde el cliente como antes.
--
-- "pendientes_texto" se incluye en la misma función para resolver
-- los dos números en un solo viaje al servidor.
-- =============================================================

CREATE OR REPLACE FUNCTION admin_resumen_atencion(p_pin_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash             TEXT;
  v_pendientes_texto INTEGER;
  v_sin_clave        INTEGER;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT COUNT(*) INTO v_pendientes_texto
  FROM respuestas_examenes
  WHERE texto_revisado = false;

  SELECT COUNT(*) INTO v_sin_clave
  FROM estudiantes_lista
  WHERE clave IS NULL AND activo = true;

  RETURN jsonb_build_object(
    'ok', true,
    'pendientes_texto', v_pendientes_texto,
    'sin_clave', v_sin_clave
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_resumen_atencion(TEXT) TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución (reemplazar HASH por un token
-- de sesión admin vigente):
--
--   select admin_resumen_atencion('HASH');
--
-- Debe devolver {"ok":true,"pendientes_texto":N,"sin_clave":N}.
-- Con hash inválido: {"error":"No autorizado"}.
-- =============================================================
