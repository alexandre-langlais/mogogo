-- Table des codes premium (ex: BETATESTER pour les testeurs preview)
-- Les lignes sont inserees manuellement dans la BDD cible, pas via migration.
CREATE TABLE IF NOT EXISTS public.premium_codes (
  code text PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.premium_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_authenticated" ON public.premium_codes
  FOR SELECT USING (auth.role() = 'authenticated');

-- RPC : verifie que le code existe, qu'il n'a pas deja ete utilise sur ce device,
-- puis passe le profil de l'utilisateur en premium.
CREATE OR REPLACE FUNCTION redeem_premium_code(p_device_id text, p_code text)
RETURNS text  -- 'ok', 'not_found', 'already_redeemed'
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verifier que le code existe
  IF NOT EXISTS (SELECT 1 FROM public.premium_codes WHERE code = p_code) THEN
    RETURN 'not_found';
  END IF;

  -- Verifier si deja utilise sur ce device
  IF EXISTS (SELECT 1 FROM public.promo_redemptions WHERE device_id = p_device_id AND code = p_code) THEN
    RETURN 'already_redeemed';
  END IF;

  -- Enregistrer la redemption
  INSERT INTO public.promo_redemptions (device_id, code) VALUES (p_device_id, p_code);

  -- Passer le profil en premium
  UPDATE public.profiles SET plan = 'premium' WHERE id = auth.uid();

  RETURN 'ok';
END;
$$;
