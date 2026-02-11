-- Suppression du systeme de plumes (monnaie virtuelle)

-- Supprimer la fonction atomique
DROP FUNCTION IF EXISTS check_and_consume_plume(UUID);

-- Supprimer les colonnes du profil
ALTER TABLE profiles
  DROP COLUMN IF EXISTS plumes_balance,
  DROP COLUMN IF EXISTS last_refill_date;
