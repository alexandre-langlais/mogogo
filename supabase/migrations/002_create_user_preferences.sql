CREATE TABLE public.user_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  tag_slug text NOT NULL,
  score integer DEFAULT 1 CHECK (score >= 0 AND score <= 100),
  updated_at timestamptz DEFAULT timezone('utc', now()),
  UNIQUE (user_id, tag_slug)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- CRUD par l'utilisateur sur ses propres preferences (via anon key + RLS)
CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferences" ON public.user_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);
