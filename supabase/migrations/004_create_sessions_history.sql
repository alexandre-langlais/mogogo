-- Sessions history : persiste les recommandations validees par l'utilisateur
CREATE TABLE public.sessions_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  activity_title text NOT NULL,
  activity_description text NOT NULL,
  activity_tags text[] DEFAULT '{}',
  context_snapshot jsonb NOT NULL,
  action_links jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.sessions_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON public.sessions_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.sessions_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.sessions_history FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_sessions_history_user_created ON public.sessions_history(user_id, created_at DESC);
