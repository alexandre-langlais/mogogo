-- Table de suivi des redemptions (1 code = 1 device max)
CREATE TABLE public.promo_redemptions (
  device_id text NOT NULL,
  code text NOT NULL,
  redeemed_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (device_id, code)
);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_authenticated" ON public.promo_redemptions
  FOR SELECT USING (auth.role() = 'authenticated');
-- INSERT/DELETE : via SECURITY DEFINER uniquement

-- RPC atomique : verifie unicite device+code, decremente session_count
CREATE OR REPLACE FUNCTION redeem_promo_code(p_device_id text, p_code text, p_bonus integer)
RETURNS text  -- 'ok', 'already_redeemed'
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verifier si deja utilise sur ce device
  IF EXISTS (SELECT 1 FROM public.promo_redemptions WHERE device_id = p_device_id AND code = p_code) THEN
    RETURN 'already_redeemed';
  END IF;

  -- Enregistrer la redemption
  INSERT INTO public.promo_redemptions (device_id, code) VALUES (p_device_id, p_code);

  -- Decrementer le compteur (UPSERT si le device n'existe pas encore)
  INSERT INTO public.device_sessions (device_id, session_count, updated_at)
  VALUES (p_device_id, -p_bonus, now())
  ON CONFLICT (device_id)
  DO UPDATE SET
    session_count = device_sessions.session_count - p_bonus,
    updated_at = now();

  RETURN 'ok';
END;
$$;
