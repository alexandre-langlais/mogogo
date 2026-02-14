-- Fix: redeem_premium_code doit aussi setter device_plumes.is_premium = true
-- pour que le statut persiste au redémarrage (indépendamment de RevenueCat)
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

  -- Passer le device en premium (persistance device-level)
  INSERT INTO public.device_plumes (device_id, plumes_count, is_premium, updated_at)
  VALUES (p_device_id, 30, true, now())
  ON CONFLICT (device_id) DO UPDATE
    SET is_premium = true, updated_at = now();

  RETURN 'ok';
END;
$$;

-- Fix rétroactif : passer en premium les devices ayant déjà redeem un code premium
INSERT INTO public.device_plumes (device_id, plumes_count, is_premium, updated_at)
SELECT r.device_id, 30, true, now()
FROM public.promo_redemptions r
JOIN public.premium_codes pc ON pc.code = r.code
ON CONFLICT (device_id) DO UPDATE
  SET is_premium = true, updated_at = now();
