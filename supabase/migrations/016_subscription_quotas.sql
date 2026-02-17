-- ═══════════════════════════════════════════════════════════════════════════
-- 016 : Quotas d'appels Google Places par original_app_user_id (RevenueCat)
--
-- Protection anti-churning : le quota est lié à l'identité stable RevenueCat,
-- pas au user_id Supabase (qui change si le user supprime/recrée son compte).
-- Pas de FK vers auth.users : intentionnel.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscription_quotas (
  original_app_user_id TEXT PRIMARY KEY,
  monthly_scans_used   INTEGER NOT NULL DEFAULT 0,
  period_start         TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pas de RLS public : accès uniquement via SECURITY DEFINER RPCs
ALTER TABLE public.subscription_quotas ENABLE ROW LEVEL SECURITY;

-- ─── RPC : check_and_increment_quota ──────────────────────────────────────
-- Appelée par l'Edge Function places_scan.
-- UPSERT + auto-reset mensuel + vérification limite + incrément atomique.

CREATE OR REPLACE FUNCTION check_and_increment_quota(
  p_original_app_user_id TEXT,
  p_monthly_limit INTEGER DEFAULT 60
)
RETURNS TABLE(allowed BOOLEAN, scans_used INTEGER, scans_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_period TIMESTAMPTZ := date_trunc('month', now());
  v_used INTEGER;
BEGIN
  -- UPSERT : créer la ligne si absente, reset si nouveau mois
  INSERT INTO public.subscription_quotas (original_app_user_id, monthly_scans_used, period_start, updated_at)
  VALUES (p_original_app_user_id, 0, current_period, now())
  ON CONFLICT (original_app_user_id)
  DO UPDATE SET
    monthly_scans_used = CASE
      WHEN subscription_quotas.period_start < current_period THEN 0
      ELSE subscription_quotas.monthly_scans_used
    END,
    period_start = CASE
      WHEN subscription_quotas.period_start < current_period THEN current_period
      ELSE subscription_quotas.period_start
    END,
    updated_at = now();

  -- Lire le compteur actuel
  SELECT monthly_scans_used INTO v_used
  FROM public.subscription_quotas
  WHERE subscription_quotas.original_app_user_id = p_original_app_user_id;

  -- Vérifier la limite
  IF v_used >= p_monthly_limit THEN
    RETURN QUERY SELECT false, v_used, p_monthly_limit;
    RETURN;
  END IF;

  -- Incrémenter
  UPDATE public.subscription_quotas
  SET monthly_scans_used = monthly_scans_used + 1, updated_at = now()
  WHERE subscription_quotas.original_app_user_id = p_original_app_user_id;

  RETURN QUERY SELECT true, v_used + 1, p_monthly_limit;
END;
$$;

-- ─── RPC : get_quota_usage (lecture seule) ───────────────────────────────
-- Appelée par le client pour vérifier le quota avant d'activer le mode localisé.
-- Ne modifie RIEN : simple SELECT + calcul de la date de réinitialisation.

CREATE OR REPLACE FUNCTION get_quota_usage(
  p_original_app_user_id TEXT,
  p_monthly_limit INTEGER DEFAULT 60
)
RETURNS TABLE(scans_used INTEGER, scans_limit INTEGER, resets_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_period TIMESTAMPTZ := date_trunc('month', now());
  v_used INTEGER;
  v_period TIMESTAMPTZ;
BEGIN
  SELECT monthly_scans_used, period_start
  INTO v_used, v_period
  FROM public.subscription_quotas
  WHERE subscription_quotas.original_app_user_id = p_original_app_user_id;

  -- Pas d'entrée → 0 usage
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, p_monthly_limit, (current_period + INTERVAL '1 month')::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Période ancienne → usage effectif = 0 (sera reset au prochain scan)
  IF v_period < current_period THEN
    RETURN QUERY SELECT 0, p_monthly_limit, (current_period + INTERVAL '1 month')::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_used, p_monthly_limit, (v_period + INTERVAL '1 month')::TIMESTAMPTZ;
END;
$$;
