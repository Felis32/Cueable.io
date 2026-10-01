BEGIN;

ALTER TABLE public.ada_messages
  ADD COLUMN IF NOT EXISTS ui_message_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ada_messages_thread_ui_message_uidx
  ON public.ada_messages (thread_id, ui_message_id);

CREATE TABLE IF NOT EXISTS public.generation_defaults (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  aspect_ratio text NOT NULL DEFAULT '9:16' CHECK (aspect_ratio ~ '^[1-9][0-9]{0,3}:[1-9][0-9]{0,3}$'),
  duration_seconds integer NOT NULL DEFAULT 20 CHECK (duration_seconds BETWEEN 1 AND 600),
  voiceover boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_defaults ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.generation_defaults TO authenticated;

DROP POLICY IF EXISTS generation_defaults_select_own ON public.generation_defaults;
CREATE POLICY generation_defaults_select_own
  ON public.generation_defaults FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS generation_defaults_write_own ON public.generation_defaults;
CREATE POLICY generation_defaults_write_own
  ON public.generation_defaults FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS generation_defaults_update_own ON public.generation_defaults;
CREATE POLICY generation_defaults_update_own
  ON public.generation_defaults FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT ALL ON public.generation_defaults TO service_role;

COMMIT;