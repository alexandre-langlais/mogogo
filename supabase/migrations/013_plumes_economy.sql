-- Migration : Économie "Plumes 10/30"
-- Coût 10 plumes/session, récompense pub +30, bonus quotidien +10, packs IAP (100/300)
-- Default : 30 plumes pour les nouveaux devices

-- 1. Ajouter les colonnes pour daily reward et premium device-level
ALTER TABLE public.device_plumes ADD COLUMN IF NOT EXISTS last_daily_reward_at timestamptz DEFAULT NULL;
ALTER TABLE public.device_plumes ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

-- 2. Changer le DEFAULT de plumes_count à 30
ALTER TABLE public.device_plumes ALTER COLUMN plumes_count SET DEFAULT 30;

-- 3. Upgrade les devices existants à minimum 30 plumes
UPDATE public.device_plumes SET plumes_count = GREATEST(plumes_count, 30);

-- 4. Nouvelle RPC : consume_plumes (remplace consume_plume, consomme N plumes)
CREATE OR REPLACE FUNCTION consume_plumes(p_device_id text, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE remaining integer;
DECLARE premium boolean;
BEGIN
  -- Vérifier si le device est premium
  SELECT is_premium INTO premium
  FROM public.device_plumes
  WHERE device_id = p_device_id;

  IF premium = true THEN
    RETURN 999999;
  END IF;

  UPDATE public.device_plumes
  SET plumes_count = plumes_count - p_amount, updated_at = now()
  WHERE device_id = p_device_id AND plumes_count >= p_amount
  RETURNING plumes_count INTO remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN remaining;
END;
$$;

-- 5. Nouvelle RPC : claim_daily_reward (+10 plumes, 1x par 24h)
CREATE OR REPLACE FUNCTION claim_daily_reward(p_device_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE new_count integer;
DECLARE last_reward timestamptz;
BEGIN
  SELECT last_daily_reward_at INTO last_reward
  FROM public.device_plumes
  WHERE device_id = p_device_id;

  -- Si pas encore de row, créer avec default + bonus
  IF NOT FOUND THEN
    INSERT INTO public.device_plumes (device_id, plumes_count, last_daily_reward_at, updated_at)
    VALUES (p_device_id, 30 + 10, now(), now())
    ON CONFLICT (device_id) DO NOTHING;
    RETURN 40;
  END IF;

  -- Vérifier le cooldown de 24h
  IF last_reward IS NOT NULL AND last_reward + interval '24 hours' > now() THEN
    RETURN -1;
  END IF;

  -- Créditer le bonus
  UPDATE public.device_plumes
  SET plumes_count = plumes_count + 10,
      last_daily_reward_at = now(),
      updated_at = now()
  WHERE device_id = p_device_id
  RETURNING plumes_count INTO new_count;

  RETURN new_count;
END;
$$;

-- 6. Nouvelle RPC : set_device_premium
CREATE OR REPLACE FUNCTION set_device_premium(p_device_id text, p_is_premium boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.device_plumes (device_id, plumes_count, is_premium, updated_at)
  VALUES (p_device_id, 30, p_is_premium, now())
  ON CONFLICT (device_id)
  DO UPDATE SET is_premium = p_is_premium, updated_at = now();
END;
$$;

-- 7. Nouvelle RPC : get_device_plumes_info (retourne plumes + daily reward + premium en 1 appel)
CREATE OR REPLACE FUNCTION get_device_plumes_info(p_device_id text)
RETURNS TABLE(plumes_count integer, last_daily_reward_at timestamptz, is_premium boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT dp.plumes_count, dp.last_daily_reward_at, dp.is_premium
  FROM public.device_plumes dp
  WHERE dp.device_id = p_device_id;

  IF NOT FOUND THEN
    INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
    VALUES (p_device_id, 30, now())
    ON CONFLICT (device_id) DO NOTHING;

    RETURN QUERY SELECT 30, NULL::timestamptz, false;
  END IF;
END;
$$;

-- 8. Mettre à jour les RPCs existantes : default 3 → 30

-- get_device_plumes : default 30
CREATE OR REPLACE FUNCTION get_device_plumes(p_device_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE count integer;
BEGIN
  SELECT dp.plumes_count INTO count
  FROM public.device_plumes dp
  WHERE dp.device_id = p_device_id;

  IF NOT FOUND THEN
    INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
    VALUES (p_device_id, 30, now())
    ON CONFLICT (device_id) DO NOTHING;
    RETURN 30;
  END IF;

  RETURN count;
END;
$$;

-- credit_plumes : default UPSERT 30 + amount
CREATE OR REPLACE FUNCTION credit_plumes(p_device_id text, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE new_count integer;
BEGIN
  INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
  VALUES (p_device_id, 30 + p_amount, now())
  ON CONFLICT (device_id)
  DO UPDATE SET
    plumes_count = device_plumes.plumes_count + p_amount,
    updated_at = now()
  RETURNING device_plumes.plumes_count INTO new_count;

  RETURN new_count;
END;
$$;

-- redeem_promo_code : default UPSERT 30 + bonus
CREATE OR REPLACE FUNCTION redeem_promo_code(p_device_id text, p_code text, p_bonus integer)
RETURNS text
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

  -- Crediter les plumes (UPSERT si le device n'existe pas encore)
  INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
  VALUES (p_device_id, 30 + p_bonus, now())
  ON CONFLICT (device_id)
  DO UPDATE SET
    plumes_count = device_plumes.plumes_count + p_bonus,
    updated_at = now();

  RETURN 'ok';
END;
$$;
