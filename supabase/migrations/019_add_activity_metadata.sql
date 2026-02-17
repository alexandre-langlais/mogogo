-- Métadonnées optionnelles pour les activités outdoor (rating, prix, horaires, etc.)
ALTER TABLE public.sessions_history ADD COLUMN activity_metadata jsonb;
