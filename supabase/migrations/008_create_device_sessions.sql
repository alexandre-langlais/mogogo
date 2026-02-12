CREATE TABLE public.device_sessions (
  device_id text PRIMARY KEY,
  session_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT : utilisateurs authentifiés
CREATE POLICY "select_authenticated" ON public.device_sessions
  FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT/UPDATE : uniquement service_role (Edge Function)
CREATE POLICY "insert_service_role" ON public.device_sessions
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "update_service_role" ON public.device_sessions
  FOR UPDATE USING (auth.role() = 'service_role');

-- Pas de DELETE policy → table immuable

-- Fonction RPC d'incrément atomique (SECURITY DEFINER = bypass RLS)
CREATE OR REPLACE FUNCTION increment_device_session(p_device_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE new_count integer;
BEGIN
  INSERT INTO public.device_sessions (device_id, session_count, updated_at)
  VALUES (p_device_id, 1, now())
  ON CONFLICT (device_id)
  DO UPDATE SET
    session_count = device_sessions.session_count + 1,
    updated_at = now()
  RETURNING session_count INTO new_count;
  RETURN new_count;
END;
$$;
