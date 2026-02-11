-- Ajout du coût monétaire par appel LLM
ALTER TABLE public.llm_calls ADD COLUMN cost_usd numeric;

-- Vues d'analyse des appels LLM

-- Coût et tokens par session
CREATE OR REPLACE VIEW public.v_llm_calls_by_session AS
SELECT
  session_id,
  COUNT(*) AS calls,
  SUM(prompt_tokens) AS input_tokens,
  SUM(completion_tokens) AS output_tokens,
  SUM(cost_usd) AS cost_usd,
  MIN(created_at) AS started_at
FROM public.llm_calls
GROUP BY session_id
ORDER BY MIN(created_at) DESC;

-- Coût et tokens par session et modèle
CREATE OR REPLACE VIEW public.v_llm_calls_by_session_model AS
SELECT
  session_id,
  model,
  COUNT(*) AS calls,
  SUM(prompt_tokens) AS input_tokens,
  SUM(completion_tokens) AS output_tokens,
  SUM(cost_usd) AS cost_usd,
  MIN(created_at) AS started_at
FROM public.llm_calls
GROUP BY session_id, model
ORDER BY MIN(created_at) DESC;

-- Statistiques de coût agrégées (7 derniers jours)
CREATE OR REPLACE VIEW public.v_llm_cost_stats_7d AS
SELECT
  COUNT(DISTINCT session_id) AS sessions,
  AVG(session_cost) AS avg_cost_usd,
  MIN(session_cost) AS min_cost_usd,
  MAX(session_cost) AS max_cost_usd,
  SUM(session_cost) AS total_cost_usd
FROM (
  SELECT session_id, SUM(cost_usd) AS session_cost
  FROM public.llm_calls
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY session_id
) sub;

-- Statistiques de coût agrégées (30 derniers jours)
CREATE OR REPLACE VIEW public.v_llm_cost_stats_30d AS
SELECT
    COUNT(DISTINCT session_id) AS sessions,
    AVG(session_cost) AS avg_cost_usd,
    MIN(session_cost) AS min_cost_usd,
    MAX(session_cost) AS max_cost_usd,
    SUM(session_cost) AS total_cost_usd
FROM (
         SELECT session_id, SUM(cost_usd) AS session_cost
         FROM public.llm_calls
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY session_id
     ) sub;
