-- Ajout du systeme de plumes (monnaie virtuelle) aux profils
ALTER TABLE profiles
  ADD COLUMN plumes_balance integer NOT NULL DEFAULT 5,
  ADD COLUMN last_refill_date date NOT NULL DEFAULT CURRENT_DATE;

-- Fonction atomique : verifie et consomme une plume (anti-race condition)
CREATE OR REPLACE FUNCTION check_and_consume_plume(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan text;
  v_balance integer;
  v_refill_date date;
BEGIN
  -- Verrouillage ligne pour eviter les race conditions
  SELECT plan, plumes_balance, last_refill_date
    INTO v_plan, v_balance, v_refill_date
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

  -- Utilisateur introuvable
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Premium : pas de consommation
  IF v_plan = 'premium' THEN
    RETURN true;
  END IF;

  -- Refill journalier si la date a change
  IF v_refill_date < CURRENT_DATE THEN
    UPDATE profiles
      SET plumes_balance = 4, -- 5 - 1 (on consomme directement)
          last_refill_date = CURRENT_DATE
      WHERE id = p_user_id;
    RETURN true;
  END IF;

  -- Solde suffisant : decrementer
  IF v_balance > 0 THEN
    UPDATE profiles
      SET plumes_balance = v_balance - 1
      WHERE id = p_user_id;
    RETURN true;
  END IF;

  -- Plus de plumes
  RETURN false;
END;
$$;
