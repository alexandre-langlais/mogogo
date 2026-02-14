-- Migration : device_sessions → device_plumes (système de plumes magiques)
-- session_count (compteur croissant) → plumes_count (stock décroissant, default 3)

-- 1. Renommer la table et la colonne
ALTER TABLE public.device_sessions RENAME TO device_plumes;
ALTER TABLE public.device_plumes RENAME COLUMN session_count TO plumes_count;

-- 2. Convertir les données : plumes = max(0, 3 - ancien_session_count)
UPDATE public.device_plumes SET plumes_count = GREATEST(0, 3 - plumes_count);

-- 3. Ajouter le DEFAULT et le CHECK
ALTER TABLE public.device_plumes ALTER COLUMN plumes_count SET DEFAULT 3;
ALTER TABLE public.device_plumes ADD CONSTRAINT plumes_count_non_negative CHECK (plumes_count >= 0);

-- 4. Supprimer l'ancienne RPC
DROP FUNCTION IF EXISTS increment_device_session(text);

-- 5. Nouvelles RPCs

-- consume_plume : décrémente atomiquement, retourne le solde restant ou -1 si 0
CREATE OR REPLACE FUNCTION consume_plume(p_device_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE remaining integer;
BEGIN
  UPDATE public.device_plumes
  SET plumes_count = plumes_count - 1, updated_at = now()
  WHERE device_id = p_device_id AND plumes_count > 0
  RETURNING plumes_count INTO remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN remaining;
END;
$$;

-- credit_plumes : incrémente atomiquement, retourne le nouveau solde
CREATE OR REPLACE FUNCTION credit_plumes(p_device_id text, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE new_count integer;
BEGIN
  INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
  VALUES (p_device_id, 3 + p_amount, now())
  ON CONFLICT (device_id)
  DO UPDATE SET
    plumes_count = device_plumes.plumes_count + p_amount,
    updated_at = now()
  RETURNING plumes_count INTO new_count;

  RETURN new_count;
END;
$$;

-- get_device_plumes : lecture (auto-create si absent, retourne 3)
CREATE OR REPLACE FUNCTION get_device_plumes(p_device_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE count integer;
BEGIN
  SELECT plumes_count INTO count
  FROM public.device_plumes
  WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
    VALUES (p_device_id, 3, now())
    ON CONFLICT (device_id) DO NOTHING;
    RETURN 3;
  END IF;

  RETURN count;
END;
$$;

-- 6. Mettre à jour redeem_promo_code : session_count - p_bonus → plumes_count + p_bonus
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

  -- Crediter les plumes (UPSERT si le device n'existe pas encore)
  INSERT INTO public.device_plumes (device_id, plumes_count, updated_at)
  VALUES (p_device_id, 3 + p_bonus, now())
  ON CONFLICT (device_id)
  DO UPDATE SET
    plumes_count = device_plumes.plumes_count + p_bonus,
    updated_at = now();

  RETURN 'ok';
END;
$$;
