-- =============================================================
-- Bloque 7 — Informe general cargado por el docente (JSON)
-- Exámenes Santo Cura de Ars · Portal FIHR
-- Aplicar en Supabase: SQL Editor → New query → pegar y ejecutar
-- =============================================================
--
-- Tabla informes_grado: guarda los informes que el docente pega
-- como JSON desde el panel admin (título, grado, fecha, resumen,
-- fortalezas y áreas de mejora). Se muestran tal cual en el portal
-- de clases (examenes.html) del grado correspondiente — la web no
-- hace ningún análisis ni interpretación, solo formatea lo que el
-- docente ya redactó.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 1: Tabla informes_grado
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS informes_grado (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  grado           TEXT        NOT NULL,
  titulo          TEXT        NOT NULL,
  fecha           DATE,
  resumen         TEXT        NOT NULL,
  fortalezas      JSONB       NOT NULL DEFAULT '[]'::JSONB,
  areas_de_mejora JSONB       NOT NULL DEFAULT '[]'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS informes_grado_grado_idx ON informes_grado (grado, created_at DESC);

-- RLS: lectura pública (igual que clases_config/clases_contenido, que
-- ya se leen directo desde el cliente en examenes.html), escritura
-- solo a través de admin_guardar_informe (SECURITY DEFINER, ignora RLS).
ALTER TABLE informes_grado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_informes_publico" ON informes_grado
  FOR SELECT TO anon, authenticated
  USING (true);


-- ─────────────────────────────────────────────────────────────
-- BLOQUE 2: RPC admin_guardar_informe
-- Valida los campos mínimos (titulo, grado, resumen) — igual que
-- procesarImportJSON ya valida el JSON de examen en el cliente,
-- pero acá la validación es server-side.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_guardar_informe(
  p_pin_hash TEXT,
  p_datos    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash    TEXT;
  v_titulo  TEXT;
  v_grado   TEXT;
  v_resumen TEXT;
  v_fecha   DATE;
  v_id      UUID;
BEGIN
  SELECT pin_hash INTO v_hash FROM admin_config LIMIT 1;
  IF v_hash IS NULL OR v_hash <> p_pin_hash THEN
    RETURN jsonb_build_object('error', 'No autorizado');
  END IF;

  v_titulo  := trim(p_datos->>'titulo');
  v_grado   := trim(p_datos->>'grado');
  v_resumen := trim(p_datos->>'resumen');

  IF v_titulo IS NULL OR v_titulo = '' THEN
    RETURN jsonb_build_object('error', 'Falta el campo "titulo"');
  END IF;
  IF v_grado IS NULL OR v_grado = '' THEN
    RETURN jsonb_build_object('error', 'Falta el campo "grado"');
  END IF;
  IF v_resumen IS NULL OR v_resumen = '' THEN
    RETURN jsonb_build_object('error', 'Falta el campo "resumen"');
  END IF;

  BEGIN
    v_fecha := NULLIF(p_datos->>'fecha', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'El campo "fecha" debe tener formato AAAA-MM-DD');
  END;

  INSERT INTO informes_grado (grado, titulo, fecha, resumen, fortalezas, areas_de_mejora)
  VALUES (
    v_grado, v_titulo, v_fecha, v_resumen,
    COALESCE(p_datos->'fortalezas', '[]'::JSONB),
    COALESCE(p_datos->'areas_de_mejora', '[]'::JSONB)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_guardar_informe(TEXT, JSONB) TO anon, authenticated;


-- =============================================================
-- FIN DE MIGRACIÓN
-- =============================================================
-- Verificación rápida post-ejecución (reemplazar HASH por un token
-- de sesión admin vigente):
--
--   select admin_guardar_informe('HASH', '{
--     "titulo": "Informe general — Período 2, Semana 3",
--     "grado": "6to",
--     "fecha": "2026-07-12",
--     "resumen": "texto breve",
--     "fortalezas": ["punto 1", "punto 2"],
--     "areas_de_mejora": ["punto 1", "punto 2"]
--   }'::jsonb);
--
-- Debe devolver {"ok":true,"id":"..."}. Luego confirmar que aparece:
--   select * from informes_grado where grado = '6to' order by created_at desc;
--
-- Con hash inválido debe devolver {"error":"No autorizado"}.
-- Sin "resumen" debe devolver {"error":"Falta el campo \"resumen\""}.
-- =============================================================
