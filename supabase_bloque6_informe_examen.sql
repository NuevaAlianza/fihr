-- =============================================================
-- Bloque 6 — Informe agregado por grado (estadísticas de un examen)
-- Exámenes Santo Cura de Ars · Portal FIHR
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- =============================================================
--
-- RPC admin_informe_examen: agregación numérica pura (promedio,
-- mínimo, máximo, envíos vs. esperados, desglose por sección y
-- lista de quién no envió) — sin ninguna interpretación de "por
-- qué" (eso lo cubre el informe cargado a mano del Bloque 7).
--
-- "Esperados" = estudiantes activos de estudiantes_lista en el
-- grado del examen, filtrados por las secciones autorizadas del
-- examen (secciones_activas) si el examen las restringe; si no,
-- todas las secciones con estudiantes activos en ese grado.
--
-- El promedio usa COALESCE(puntos_total, puntos_auto): si el
-- docente todavía no corrigió las preguntas de desarrollo de un
-- estudiante, se usa su puntaje automático parcial en vez de
-- excluirlo del promedio.
-- =============================================================

CREATE OR REPLACE FUNCTION admin_informe_examen(
  p_pin_hash  TEXT,
  p_examen_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash              TEXT;
  v_titulo            TEXT;
  v_grado             TEXT;
  v_secciones_activas JSONB;
  v_secciones         TEXT[];
  v_sec               TEXT;
  v_general           JSONB;
  v_por_seccion       JSONB := '[]'::JSONB;
  v_faltantes         JSONB;
  v_esperados         INTEGER;
  v_enviados          INTEGER;
  v_promedio          NUMERIC;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  SELECT titulo, grado, secciones_activas INTO v_titulo, v_grado, v_secciones_activas
  FROM examenes WHERE id::text = p_examen_id;

  IF v_grado IS NULL THEN
    RETURN jsonb_build_object('error', 'Examen no encontrado');
  END IF;

  IF v_secciones_activas IS NOT NULL AND jsonb_array_length(v_secciones_activas) > 0 THEN
    SELECT array_agg(x ORDER BY x) INTO v_secciones FROM jsonb_array_elements_text(v_secciones_activas) x;
  ELSE
    SELECT array_agg(DISTINCT seccion ORDER BY seccion) INTO v_secciones
    FROM estudiantes_lista WHERE grado = v_grado AND activo = true;
  END IF;
  v_secciones := COALESCE(v_secciones, ARRAY[]::TEXT[]);

  -- ── Estadísticas generales (todos los envíos del examen) ──
  SELECT jsonb_build_object(
    'promedio',        ROUND(AVG(COALESCE(puntos_total, puntos_auto)), 1),
    'minimo',          MIN(COALESCE(puntos_total, puntos_auto)),
    'maximo',          MAX(COALESCE(puntos_total, puntos_auto)),
    'maximo_posible',  MAX(puntos_maximo),
    'enviados',        COUNT(*)
  ) INTO v_general
  FROM respuestas_examenes
  WHERE examen_id::text = p_examen_id;

  -- ── Desglose por sección (esperados vs. enviados vs. promedio) ──
  FOREACH v_sec IN ARRAY v_secciones LOOP
    SELECT COUNT(*) INTO v_esperados
    FROM estudiantes_lista
    WHERE grado = v_grado AND seccion = v_sec AND activo = true;

    SELECT COUNT(*), ROUND(AVG(COALESCE(puntos_total, puntos_auto)), 1)
    INTO v_enviados, v_promedio
    FROM respuestas_examenes
    WHERE examen_id::text = p_examen_id AND seccion = v_sec;

    v_por_seccion := v_por_seccion || jsonb_build_array(jsonb_build_object(
      'seccion',   v_sec,
      'esperados', v_esperados,
      'enviados',  v_enviados,
      'promedio',  v_promedio
    ));
  END LOOP;

  -- ── Quién no envió (de las secciones consideradas) ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'nombre', el.nombre, 'numero_orden', el.numero_orden, 'seccion', el.seccion
         ) ORDER BY el.seccion, el.numero_orden), '[]'::JSONB)
  INTO v_faltantes
  FROM estudiantes_lista el
  WHERE el.grado = v_grado
    AND el.activo = true
    AND el.seccion = ANY(v_secciones)
    AND NOT EXISTS (
      SELECT 1 FROM respuestas_examenes r
      WHERE r.examen_id::text = p_examen_id
        AND r.seccion = el.seccion
        AND r.numero_orden = el.numero_orden
    );

  RETURN jsonb_build_object(
    'ok', true,
    'examen_titulo', v_titulo,
    'grado', v_grado,
    'general', v_general,
    'por_seccion', v_por_seccion,
    'faltantes', v_faltantes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_informe_examen(TEXT, TEXT) TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución (reemplazar HASH por un token
-- de sesión admin vigente, y el id por un examen real):
--
--   select admin_informe_examen('HASH', 'ID-DEL-EXAMEN');
--
-- Debe devolver {"ok":true,"general":{...},"por_seccion":[...],
-- "faltantes":[...]}. Con hash inválido: {"error":"No autorizado"}.
-- =============================================================
