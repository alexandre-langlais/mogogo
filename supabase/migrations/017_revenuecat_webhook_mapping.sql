-- ═══════════════════════════════════════════════════════════════════════════
-- 017 : Mapping RevenueCat app_user_id → original_app_user_id (webhook)
--
-- Remplace le pull REST V1 par un modèle push : RevenueCat envoie des
-- webhooks qui alimentent cette table. Le pipeline places_scan lit le
-- mapping en base au lieu d'appeler l'API RC à chaque requête.
--
-- Pas de FK vers auth.users : intentionnel (cohérent avec subscription_quotas).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.revenuecat_user_mapping (
  app_user_id          TEXT PRIMARY KEY,
  original_app_user_id TEXT NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcum_original
  ON public.revenuecat_user_mapping (original_app_user_id);

ALTER TABLE public.revenuecat_user_mapping ENABLE ROW LEVEL SECURITY;

-- ─── RPC : upsert_revenuecat_mapping ────────────────────────────────────
-- Appelée par l'Edge Function revenuecat-webhook.
-- UPSERT idempotent du mapping.

CREATE OR REPLACE FUNCTION upsert_revenuecat_mapping(
  p_app_user_id TEXT, p_original_app_user_id TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.revenuecat_user_mapping (app_user_id, original_app_user_id, updated_at)
  VALUES (p_app_user_id, p_original_app_user_id, now())
  ON CONFLICT (app_user_id) DO UPDATE SET
    original_app_user_id = EXCLUDED.original_app_user_id, updated_at = now();
END;
$$;
