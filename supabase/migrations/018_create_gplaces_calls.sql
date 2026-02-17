-- Tracking des appels Google Places (Nearby Search, Place Details)
CREATE TABLE public.gplaces_calls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  session_id uuid NOT NULL,
  api_method text NOT NULL,       -- 'nearby_search' | 'place_details'
  sku text NOT NULL,              -- ex: 'nearby_search_enterprise', 'place_details_enterprise_atmosphere'
  cost_usd numeric,
  place_count integer DEFAULT 1,  -- nombre de résultats retournés ou de requêtes Place Details
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.gplaces_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON public.gplaces_calls FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_gplaces_calls_session ON public.gplaces_calls(session_id);
CREATE INDEX idx_gplaces_calls_user_created ON public.gplaces_calls(user_id, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════
-- Vues Google Places (miroir des vues LLM existantes)
-- ══════════════════════════════════════════════════════════════════════════

-- V1 : Coût par session
CREATE OR REPLACE VIEW public.v_gplaces_calls_by_session AS
SELECT
  session_id,
  COUNT(*) AS calls,
  SUM(place_count) AS total_places,
  SUM(cost_usd) AS cost_usd,
  MIN(created_at) AS started_at
FROM public.gplaces_calls
GROUP BY session_id
ORDER BY MIN(created_at) DESC;

-- V2 : Coût par session et SKU
CREATE OR REPLACE VIEW public.v_gplaces_calls_by_session_sku AS
SELECT
  session_id,
  sku,
  COUNT(*) AS calls,
  SUM(place_count) AS total_places,
  SUM(cost_usd) AS cost_usd,
  MIN(created_at) AS started_at
FROM public.gplaces_calls
GROUP BY session_id, sku
ORDER BY MIN(created_at) DESC;

-- V3 : Stats agrégées 7 jours
CREATE OR REPLACE VIEW public.v_gplaces_cost_stats_7d AS
SELECT
  COUNT(DISTINCT session_id) AS sessions,
  AVG(session_cost) AS avg_cost_usd,
  MIN(session_cost) AS min_cost_usd,
  MAX(session_cost) AS max_cost_usd,
  SUM(session_cost) AS total_cost_usd
FROM (
  SELECT session_id, SUM(cost_usd) AS session_cost
  FROM public.gplaces_calls
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY session_id
) sub;

-- V4 : Stats agrégées 30 jours
CREATE OR REPLACE VIEW public.v_gplaces_cost_stats_30d AS
SELECT
  COUNT(DISTINCT session_id) AS sessions,
  AVG(session_cost) AS avg_cost_usd,
  MIN(session_cost) AS min_cost_usd,
  MAX(session_cost) AS max_cost_usd,
  SUM(session_cost) AS total_cost_usd
FROM (
  SELECT session_id, SUM(cost_usd) AS session_cost
  FROM public.gplaces_calls
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY session_id
) sub;

-- ══════════════════════════════════════════════════════════════════════════
-- Vues combinées LLM + Google Places
-- ══════════════════════════════════════════════════════════════════════════

-- V5 : Coût total (LLM + Places) 7 jours
CREATE OR REPLACE VIEW public.v_total_cost_stats_7d AS
SELECT
  COALESCE(llm.sessions, 0) + COALESCE(gp.sessions, 0) AS total_sessions,
  COALESCE(llm.total_cost_usd, 0) AS llm_cost_usd,
  COALESCE(gp.total_cost_usd, 0) AS gplaces_cost_usd,
  COALESCE(llm.total_cost_usd, 0) + COALESCE(gp.total_cost_usd, 0) AS total_cost_usd
FROM (SELECT * FROM public.v_llm_cost_stats_7d) llm,
     (SELECT * FROM public.v_gplaces_cost_stats_7d) gp;

-- V6 : Coût total (LLM + Places) 30 jours
CREATE OR REPLACE VIEW public.v_total_cost_stats_30d AS
SELECT
  COALESCE(llm.sessions, 0) + COALESCE(gp.sessions, 0) AS total_sessions,
  COALESCE(llm.total_cost_usd, 0) AS llm_cost_usd,
  COALESCE(gp.total_cost_usd, 0) AS gplaces_cost_usd,
  COALESCE(llm.total_cost_usd, 0) + COALESCE(gp.total_cost_usd, 0) AS total_cost_usd
FROM (SELECT * FROM public.v_llm_cost_stats_30d) llm,
     (SELECT * FROM public.v_gplaces_cost_stats_30d) gp;
