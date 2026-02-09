-- Token tracking : enregistre chaque appel LLM avec les tokens consommes
CREATE TABLE public.llm_calls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  session_id uuid NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  model text,
  choice text,
  is_prefetch boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.llm_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON public.llm_calls FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_llm_calls_session ON public.llm_calls(session_id);
CREATE INDEX idx_llm_calls_user_created ON public.llm_calls(user_id, created_at DESC);

-- Lier sessions validees aux appels LLM
ALTER TABLE public.sessions_history ADD COLUMN session_id uuid;
CREATE INDEX idx_sessions_history_session_id ON public.sessions_history(session_id);
