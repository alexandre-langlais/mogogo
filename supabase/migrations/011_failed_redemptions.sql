-- Table pour traquer les tentatives echouees (rate limiting anti brute-force)
CREATE TABLE public.failed_redemptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id text NOT NULL,
  attempted_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_failed_redemptions_device_time
  ON public.failed_redemptions (device_id, attempted_at);

ALTER TABLE public.failed_redemptions ENABLE ROW LEVEL SECURITY;
-- Pas de policy SELECT : acces uniquement via SECURITY DEFINER

-- Helper : retourne true si le device est rate-limite (>5 echecs en 10 min)
CREATE OR REPLACE FUNCTION check_redemption_rate_limit(p_device_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_blocked boolean;
BEGIN
  -- Purger les entrees > 1h (nettoyage opportuniste, max 100 lignes)
  DELETE FROM public.failed_redemptions
  WHERE id IN (
    SELECT id FROM public.failed_redemptions
    WHERE attempted_at < now() - interval '1 hour'
    LIMIT 100
  );

  SELECT count(*) > 5 INTO is_blocked
  FROM public.failed_redemptions
  WHERE device_id = p_device_id
    AND attempted_at > now() - interval '10 minutes';

  RETURN is_blocked;
END;
$$;

-- Remplacer redeem_promo_code avec rate limit
CREATE OR REPLACE FUNCTION redeem_promo_code(p_device_id text, p_code text, p_bonus integer)
RETURNS text  -- 'ok', 'already_redeemed', 'too_many_attempts'
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Rate limit check
  IF check_redemption_rate_limit(p_device_id) THEN
    RETURN 'too_many_attempts';
  END IF;

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

-- Remplacer redeem_premium_code avec rate limit + log echecs
CREATE OR REPLACE FUNCTION redeem_premium_code(p_device_id text, p_code text)
RETURNS text  -- 'ok', 'not_found', 'already_redeemed', 'too_many_attempts'
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Rate limit check
  IF check_redemption_rate_limit(p_device_id) THEN
    RETURN 'too_many_attempts';
  END IF;

  -- Verifier que le code existe
  IF NOT EXISTS (SELECT 1 FROM public.premium_codes WHERE code = p_code) THEN
    -- Logger la tentative echouee
    INSERT INTO public.failed_redemptions (device_id) VALUES (p_device_id);
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
