-- =============================================================
-- Bloque 4 — Buscador de respuestas para el admin
-- Exámenes Santo Cura de Ars · Portal FIHR
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- =============================================================
--
-- RPC admin_buscar_respuestas: busca envíos por nombre (substring)
-- o número de orden (exacto), con filtro opcional de examen, y
-- devuelve el detalle completo pregunta por pregunta: texto de la
-- pregunta, lo que respondió el estudiante, la respuesta correcta
-- de referencia, y si fue correcta/incorrecta/parcial/sin corregir.
--
-- Reutiliza detalle_notas (ya calculado y guardado por
-- public_enviar_respuesta al momento del envío, con la misma lógica
-- de public_calificar_respuesta) en vez de recalcular la corrección
-- de nuevo — evita duplicar esa lógica y el riesgo de que las dos
-- copias diverjan con el tiempo.
--
-- Solo requiere PIN de admin (p_pin_hash) — no requiere que el
-- examen ya esté corregido: es una consulta de solo lectura.
-- =============================================================

CREATE OR REPLACE FUNCTION admin_buscar_respuestas(
  p_pin_hash  TEXT,
  p_query     TEXT,
  p_examen_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash        TEXT;
  v_resultados  JSONB := '[]'::JSONB;
  v_row         RECORD;
  v_preguntas   JSONB;
  v_respuestas  JSONB;
  v_detalle     JSONB;
  v_items       JSONB;
  v_pregunta    JSONB;
  v_ditem       JSONB;
  v_item        JSONB;
  v_resp        TEXT;
  v_pts_max     INTEGER;
  v_pts_obt     TEXT;
  v_estado      TEXT;
  v_correcta_ref JSONB;
  v_dado_ref     JSONB;
  i             INTEGER;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object('error', 'Escribe al menos 2 caracteres para buscar');
  END IF;

  FOR v_row IN
    SELECT r.id, r.examen_id, r.nombre, r.numero_orden, r.seccion, r.grado,
           r.respuestas, r.detalle_notas, r.puntos_auto, r.puntos_texto,
           r.puntos_total, r.puntos_maximo, r.texto_revisado, r.submitted_at,
           e.titulo AS examen_titulo, e.preguntas
    FROM respuestas_examenes r
    JOIN examenes e ON e.id::text = r.examen_id::text
    WHERE (p_examen_id IS NULL OR r.examen_id::text = p_examen_id)
      AND (
        r.nombre ILIKE '%' || trim(p_query) || '%'
        OR r.numero_orden::text = trim(p_query)
      )
    ORDER BY r.submitted_at DESC
    LIMIT 50
  LOOP
    v_preguntas  := COALESCE(v_row.preguntas, '[]'::JSONB);
    v_respuestas := COALESCE(v_row.respuestas, '{}'::JSONB);
    v_detalle    := COALESCE(v_row.detalle_notas, '[]'::JSONB);
    v_items      := '[]'::JSONB;

    FOR i IN 0..jsonb_array_length(v_preguntas) - 1 LOOP
      v_pregunta := v_preguntas->i;
      v_resp     := v_respuestas->>(i::text);
      v_pts_max  := COALESCE((v_pregunta->>'puntos')::int, 0);

      -- Buscar el item de detalle_notas correspondiente a esta pregunta (qi = i)
      SELECT d INTO v_ditem
      FROM jsonb_array_elements(v_detalle) d
      WHERE (d->>'qi')::int = i
      LIMIT 1;
      v_pts_obt := v_ditem->>'pts';

      v_estado := CASE
        WHEN v_pregunta->>'tipo' IN ('texto', 'lectura') THEN 'manual'
        WHEN v_pts_obt IS NULL THEN NULL
        WHEN v_pts_max = 0 THEN NULL
        WHEN v_pts_obt::int >= v_pts_max THEN 'correcta'
        WHEN v_pts_obt::int = 0 THEN 'incorrecta'
        ELSE 'parcial'
      END;

      -- Respuesta correcta de referencia y respuesta dada, según tipo
      v_correcta_ref := NULL; v_dado_ref := NULL;
      CASE v_pregunta->>'tipo'
        WHEN 'multiple' THEN
          v_dado_ref := CASE WHEN v_resp ~ '^\d+$' THEN v_pregunta->'opciones'->(v_resp::int) ELSE NULL END;
          v_correcta_ref := v_pregunta->'opciones'->(
            CASE v_pregunta->>'correcta'
              WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 WHEN 'D' THEN 3 ELSE -1
            END
          );
        WHEN 'vf' THEN
          v_dado_ref := to_jsonb(v_resp);
          v_correcta_ref := v_pregunta->'correcta';
        WHEN 'completar' THEN
          v_dado_ref := v_respuestas->(i::text);
          v_correcta_ref := v_pregunta->'respuestas';
        WHEN 'ordenar' THEN
          v_dado_ref := v_respuestas->(i::text);
          v_correcta_ref := v_pregunta->'items';
        WHEN 'texto' THEN
          v_dado_ref := to_jsonb(v_resp);
        WHEN 'escala' THEN
          v_dado_ref := to_jsonb(v_resp);
        ELSE NULL;
      END CASE;

      v_item := jsonb_build_object(
        'qi', i,
        'texto', v_pregunta->>'texto',
        'tipo', v_pregunta->>'tipo',
        'opciones', v_pregunta->'opciones',
        'puntos_max', v_pts_max,
        'puntos_obtenidos', v_pts_obt,
        'respuesta_dada', v_dado_ref,
        'respuesta_correcta', v_correcta_ref,
        'estado', v_estado
      );
      v_items := v_items || jsonb_build_array(v_item);
    END LOOP;

    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'respuesta_id', v_row.id,
      'examen_id', v_row.examen_id,
      'examen_titulo', v_row.examen_titulo,
      'nombre', v_row.nombre,
      'numero_orden', v_row.numero_orden,
      'seccion', v_row.seccion,
      'grado', v_row.grado,
      'submitted_at', v_row.submitted_at,
      'puntos_auto', v_row.puntos_auto,
      'puntos_texto', v_row.puntos_texto,
      'puntos_total', v_row.puntos_total,
      'puntos_maximo', v_row.puntos_maximo,
      'texto_revisado', v_row.texto_revisado,
      'preguntas', v_items
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'resultados', v_resultados);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_buscar_respuestas(TEXT, TEXT, TEXT) TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución (reemplazar HASH por un token
-- de sesión admin vigente, obtenido con select admin_login('PIN')):
--
--   select admin_buscar_respuestas('HASH', 'garcia');
--   select admin_buscar_respuestas('HASH', '5');
--   select admin_buscar_respuestas('HASH', 'garcia', 'ID-DEL-EXAMEN');
--
-- Con PIN/hash inválido debe devolver {"error": "No autorizado"}.
-- Con menos de 2 caracteres debe devolver {"error": "Escribe al
-- menos 2 caracteres para buscar"}.
-- =============================================================
