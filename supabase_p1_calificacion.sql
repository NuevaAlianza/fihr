-- =============================================================
-- P1 — Calificación server-side
-- Exámenes Santo Cura de Ars
-- =============================================================
-- Esta función recibe las respuestas crudas del estudiante y
-- devuelve los puntos calculados. El cliente NUNCA recibe las
-- respuestas correctas — solo llega acá sin ellas.
--
-- Correcciones respecto al borrador inicial:
--
-- 1. 'multiple': S.resp[i] guarda el ÍNDICE (0-3); el campo
--    correcta de la BD almacena la LETRA (A-D). La comparación
--    directa siempre fallaba. Se convierte la letra a índice.
--
-- 2. 'completar': la respuesta del cliente llega como objeto
--    JSONB con claves STRING {"0":"palabra","1":"otra"}.
--    Se usa (p_respuestas->(i::text)) con paréntesis para
--    evitar el encadenamiento de casts i::text::jsonb que
--    daría JSONB número (no TEXT clave) y usaría indexado de
--    array en lugar de clave de objeto.
--    El acceso a blancos usa v_estudiante->>(j::text)
--    (clave texto), no v_estudiante->>j (índice entero).
--
-- 3. Todas las variables locales declaradas a nivel de función
--    — sin bloques DECLARE anidados dentro del CASE para mayor
--    claridad y compatibilidad.
-- =============================================================

CREATE OR REPLACE FUNCTION public_calificar_respuesta(
  p_examen_id  UUID,
  p_respuestas JSONB   -- {"0":"B","1":"V","2":{"0":"palabra"},"3":["x","y"]}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- estado general
  v_preguntas      JSONB;
  v_pregunta       JSONB;
  v_resp           TEXT;
  v_pts_q          INTEGER;
  v_pts_auto       INTEGER := 0;
  v_pts_max        INTEGER := 0;
  v_detalle        JSONB   := '[]'::JSONB;
  v_item           JSONB;
  i                INTEGER;

  -- múltiple: necesitamos convertir letra → índice
  v_correct_idx    INTEGER;

  -- completar: blancos
  v_correctas      JSONB;
  v_estudiante     JSONB;
  v_total_blancos  INTEGER;
  v_blancos_ok     INTEGER;
  v_pts_parcial    INTEGER;
  j                INTEGER;
  v_dado           TEXT;
  v_correcto       TEXT;
BEGIN
  -- ── Obtener el examen completo (con respuestas correctas) ────
  SELECT preguntas INTO v_preguntas
  FROM examenes
  WHERE id = p_examen_id AND activo = true;

  IF v_preguntas IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Examen no encontrado o no activo');
  END IF;

  -- ── Calificar cada pregunta ──────────────────────────────────
  FOR i IN 0..jsonb_array_length(v_preguntas) - 1 LOOP
    v_pregunta := v_preguntas->i;
    v_pts_q    := COALESCE((v_pregunta->>'puntos')::int, 0);

    -- Respuesta del estudiante para esta pregunta (como texto)
    -- i::text → "0","1","2"… ; ->> con clave texto busca en el objeto JSON
    v_resp := p_respuestas->>(i::text);

    -- Item de detalle base
    v_item := jsonb_build_object(
      'qi',    i,
      'tipo',  v_pregunta->>'tipo',
      'pts',   0,
      'auto',  true
    );

    CASE v_pregunta->>'tipo'

      -- ── Opción múltiple ──────────────────────────────────────
      -- S.resp[i] guarda el índice 0-3 (entero).
      -- El campo 'correcta' en la BD guarda la letra A-D.
      -- Convertimos la letra a índice para comparar.
      WHEN 'multiple' THEN
        v_pts_max := v_pts_max + v_pts_q;
        v_correct_idx := CASE v_pregunta->>'correcta'
          WHEN 'A' THEN 0
          WHEN 'B' THEN 1
          WHEN 'C' THEN 2
          WHEN 'D' THEN 3
          ELSE -1
        END;
        IF v_resp IS NOT NULL
           AND v_resp <> ''
           AND v_resp::int = v_correct_idx
        THEN
          v_item     := v_item || jsonb_build_object('pts', v_pts_q);
          v_pts_auto := v_pts_auto + v_pts_q;
        END IF;

      -- ── Verdadero / Falso ────────────────────────────────────
      -- S.resp[i] guarda 'V' o 'F' (string).
      -- El campo 'correcta' guarda 'V' o 'F'.
      WHEN 'vf' THEN
        v_pts_max := v_pts_max + v_pts_q;
        IF upper(COALESCE(v_resp, ''))
           = upper(COALESCE(v_pregunta->>'correcta', '_'))
        THEN
          v_item     := v_item || jsonb_build_object('pts', v_pts_q);
          v_pts_auto := v_pts_auto + v_pts_q;
        END IF;

      -- ── Completar blancos ────────────────────────────────────
      -- S.resp[i] es un objeto JS {0:"pal1", 1:"pal2"} que llega
      -- como JSONB object {"0":"pal1","1":"pal2"} (claves STRING).
      -- p_respuestas->'2' (con paréntesis para evitar encadenar
      -- casts i::text::jsonb que cambiaría el tipo del operando).
      -- v_correctas es un ARRAY JSONB → indexar con entero.
      -- v_estudiante es un OBJECT JSONB → indexar con clave texto.
      WHEN 'completar' THEN
        v_correctas     := v_pregunta->'respuestas';  -- array JSONB
        v_estudiante    := (p_respuestas->(i::text)); -- object JSONB  ← paréntesis clave
        v_total_blancos := COALESCE(jsonb_array_length(v_correctas), 0);
        v_pts_max       := v_pts_max + v_pts_q;
        v_blancos_ok    := 0;

        IF v_total_blancos > 0 AND v_estudiante IS NOT NULL THEN
          FOR j IN 0..v_total_blancos - 1 LOOP
            v_correcto := lower(trim(COALESCE(v_correctas->>j,           '')));  -- array → int
            v_dado     := lower(trim(COALESCE(v_estudiante->>(j::text),  '')));  -- object → text key
            IF v_dado <> '' AND (
              v_dado = v_correcto
              OR (length(v_dado) > 3 AND v_correcto LIKE '%' || v_dado || '%')
            ) THEN
              v_blancos_ok := v_blancos_ok + 1;
            END IF;
          END LOOP;
          v_pts_parcial := round(v_pts_q * v_blancos_ok::numeric / v_total_blancos);
          v_item     := v_item || jsonb_build_object('pts', v_pts_parcial);
          v_pts_auto := v_pts_auto + v_pts_parcial;
        END IF;

      -- ── Ordenar ──────────────────────────────────────────────
      -- S.resp[i] llega como array JSONB ["item2","item1","item3"].
      -- El campo 'items' en la BD tiene el orden correcto.
      -- Comparación exacta todo-o-nada (igual al original del cliente).
      WHEN 'ordenar' THEN
        v_pts_max := v_pts_max + v_pts_q;
        IF v_resp IS NOT NULL
           AND v_resp <> ''
           AND (v_resp::jsonb) = (v_pregunta->'items')
        THEN
          v_item     := v_item || jsonb_build_object('pts', v_pts_q);
          v_pts_auto := v_pts_auto + v_pts_q;
        END IF;

      -- ── Escala ───────────────────────────────────────────────
      -- Participación: cualquier respuesta (1-5) recibe puntos completos.
      WHEN 'escala' THEN
        v_pts_max := v_pts_max + v_pts_q;
        IF v_resp IS NOT NULL AND v_resp <> '' THEN
          v_item     := v_item || jsonb_build_object('pts', v_pts_q);
          v_pts_auto := v_pts_auto + v_pts_q;
        END IF;

      -- ── Texto abierto ─────────────────────────────────────────
      -- Requiere revisión manual — el servidor no puede calificar.
      WHEN 'texto' THEN
        v_pts_max := v_pts_max + v_pts_q;
        v_item    := v_item || jsonb_build_object('pts', 0, 'auto', false, 'pendiente', true);

      -- ── Lectura / contexto ────────────────────────────────────
      -- Bloque informativo sin puntos.
      WHEN 'lectura' THEN
        v_item := v_item || jsonb_build_object('pts', 0);

      ELSE NULL;
    END CASE;

    v_detalle := v_detalle || jsonb_build_array(v_item);
  END LOOP;

  RETURN jsonb_build_object(
    'ok',          true,
    'pts_auto',    v_pts_auto,
    'pts_max',     v_pts_max,
    'tiene_texto', (
      SELECT bool_or((p->>'tipo') = 'texto')
      FROM jsonb_array_elements(v_preguntas) p
    ),
    'detalle',     v_detalle
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public_calificar_respuesta(UUID, JSONB)
  TO anon, authenticated;


-- =============================================================
-- Verificación rápida post-ejecución:
--
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_type = 'FUNCTION'
--     AND routine_name = 'public_calificar_respuesta';
-- =============================================================
