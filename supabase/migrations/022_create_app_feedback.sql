-- 022_create_app_feedback.sql
-- Table de feedback utilisateur ("Le Puits à Souhaits")
-- One-way : INSERT only côté client, pas de SELECT

CREATE TABLE IF NOT EXISTS app_feedback (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('feature', 'bug', 'content', 'other')),
  message     text NOT NULL CHECK (char_length(trim(message)) BETWEEN 1 AND 2000),
  device_info jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL,
  status      text DEFAULT 'new' NOT NULL CHECK (status IN ('new', 'reviewed', 'resolved'))
);

-- RLS : INSERT only (le user ne peut insérer que pour lui-même)
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feedback"
  ON app_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Pas de politique SELECT → le client ne peut jamais lire les feedbacks

-- Index pour l'admin dashboard
CREATE INDEX idx_app_feedback_created_at ON app_feedback (created_at DESC);
CREATE INDEX idx_app_feedback_status ON app_feedback (status);
