-- ============================================================
-- 020 : activity_samples — inspirations communautaires anonymes
-- Alimentée automatiquement par un trigger sur sessions_history
-- ============================================================

-- Table
CREATE TABLE IF NOT EXISTS activity_samples (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text NOT NULL,
  theme         text NOT NULL,
  language      text NOT NULL DEFAULT 'fr',
  environment   text,
  social_context text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index unique pour deduplication : meme titre + meme theme + meme langue = upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_samples_title_theme_lang
  ON activity_samples (title, theme, language);

-- RLS : lecture seule pour les utilisateurs authentifies (donnees anonymes)
ALTER TABLE activity_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read activity_samples"
  ON activity_samples FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Trigger function : insere/met a jour un sample a chaque session validee
-- ============================================================
CREATE OR REPLACE FUNCTION fn_populate_activity_samples()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resolution_mode text;
  v_theme           text;
  v_environment     text;
  v_social          text;
  v_language        text;
BEGIN
  -- 1. Skip LOCATION_BASED (donnees trop specifiques a un lieu)
  v_resolution_mode := NEW.context_snapshot ->> 'resolution_mode';
  IF v_resolution_mode = 'LOCATION_BASED' THEN
    RETURN NEW;
  END IF;

  -- 2. Premier tag = theme (si absent, skip)
  IF NEW.activity_tags IS NULL OR array_length(NEW.activity_tags, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  v_theme := NEW.activity_tags[1];

  -- 3. Extraire environnement, social et langue du contexte
  v_environment := NEW.context_snapshot ->> 'environment';
  v_social      := NEW.context_snapshot ->> 'social';
  v_language    := COALESCE(NEW.context_snapshot ->> 'language', 'fr');

  -- 4. Upsert : inserer ou mettre a jour
  INSERT INTO activity_samples (title, description, theme, language, environment, social_context)
  VALUES (
    NEW.activity_title,
    NEW.activity_description,
    v_theme,
    v_language,
    v_environment,
    v_social
  )
  ON CONFLICT (title, theme, language) DO UPDATE SET
    description    = EXCLUDED.description,
    environment    = EXCLUDED.environment,
    social_context = EXCLUDED.social_context,
    created_at     = now();

  -- 5. Nettoyage : garder max 100 par theme
  DELETE FROM activity_samples
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY theme ORDER BY created_at DESC) AS rn
      FROM activity_samples
      WHERE theme = v_theme
    ) ranked
    WHERE rn > 100
  );

  RETURN NEW;
END;
$$;

-- Trigger : apres chaque insert dans sessions_history
CREATE TRIGGER trg_populate_activity_samples
  AFTER INSERT ON sessions_history
  FOR EACH ROW
  EXECUTE FUNCTION fn_populate_activity_samples();
