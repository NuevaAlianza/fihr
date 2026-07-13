-- =============================================================
-- Bloque 3 — Historial de exámenes del estudiante
-- Exámenes Santo Cura de Ars · Portal FIHR
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- =============================================================
--
-- RPC mis_intentos: devuelve los envíos de UN estudiante (grado +
-- sección + número de orden), con título del examen, fecha, puntaje
-- automático, puntaje de texto (si ya fue corregido por el docente),
-- puntaje total y si el examen ya fue revisado por completo.
--
-- No pide PIN de admin ni clave: el estudiante ya fue identificado
-- por verificar_acceso_grado() (Bloque 1) antes de poder llegar a
-- esta pantalla — acá solo se le devuelve SU PROPIO historial,
-- filtrado por el grado+sección+número que ya pasó ese gate. No
-- expone nada de otros estudiantes ni las respuestas correctas del
-- examen (solo puntajes ya calculados).
-- =============================================================

CREATE OR REPLACE FUNCTION mis_intentos(
  p_grado        TEXT,
  p_seccion      TEXT,
  p_numero_orden INTEGER
)
RETURNS TABLE (
  examen_id      TEXT,
  titulo         TEXT,
  submitted_at   TIMESTAMPTZ,
  puntos_auto    INTEGER,
  puntos_texto   INTEGER,
  puntos_total   INTEGER,
  puntos_maximo  INTEGER,
  texto_revisado BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT
      r.examen_id::text,
      e.titulo,
      r.submitted_at,
      r.puntos_auto,
      r.puntos_texto,
      r.puntos_total,
      r.puntos_maximo,
      r.texto_revisado
    FROM respuestas_examenes r
    JOIN examenes e ON e.id::text = r.examen_id::text
    WHERE r.grado = p_grado
      AND r.seccion = p_seccion
      AND r.numero_orden = p_numero_orden
    ORDER BY r.submitted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION mis_intentos(TEXT, TEXT, INTEGER) TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución (reemplazar por un grado/
-- sección/orden que ya haya enviado al menos un examen):
--
--   select * from mis_intentos('6to', 'A', 1);
--
-- Debe devolver una fila por examen enviado, más reciente primero,
-- con puntos_total/texto_revisado NULL o false mientras el docente
-- no haya corregido las preguntas de desarrollo.
-- =============================================================
