BEGIN;

CREATE TABLE IF NOT EXISTS public.ada_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New Ada conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ada_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.ada_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (length(content) <= 12000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ada_threads_user_updated_idx
  ON public.ada_threads (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ada_messages_thread_created_idx
  ON public.ada_messages (thread_id, created_at ASC);

ALTER TABLE public.ada_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ada_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.ada_threads TO authenticated;
GRANT SELECT, INSERT ON public.ada_messages TO authenticated;

DROP POLICY IF EXISTS ada_threads_select_own ON public.ada_threads;
CREATE POLICY ada_threads_select_own
  ON public.ada_threads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS ada_threads_insert_own ON public.ada_threads;
CREATE POLICY ada_threads_insert_own
  ON public.ada_threads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ada_threads_update_own ON public.ada_threads;
CREATE POLICY ada_threads_update_own
  ON public.ada_threads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ada_messages_select_own ON public.ada_messages;
CREATE POLICY ada_messages_select_own
  ON public.ada_messages FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ada_threads
      WHERE ada_threads.id = ada_messages.thread_id
        AND ada_threads.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ada_messages_insert_own ON public.ada_messages;
CREATE POLICY ada_messages_insert_own
  ON public.ada_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ada_threads
      WHERE ada_threads.id = ada_messages.thread_id
        AND ada_threads.user_id = auth.uid()
    )
  );

COMMIT;