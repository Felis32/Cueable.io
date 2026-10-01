BEGIN;

ALTER TABLE public.compose_history
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS response jsonb,
  ADD COLUMN IF NOT EXISTS plan jsonb;

UPDATE public.compose_history
SET thread_id = gen_random_uuid()
WHERE thread_id IS NULL;

ALTER TABLE public.compose_history
  ALTER COLUMN thread_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN thread_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS compose_history_thread_created_idx
  ON public.compose_history (user_id, thread_id, created_at ASC);

GRANT UPDATE ON public.compose_history TO authenticated;
DROP POLICY IF EXISTS primecut_compose_history_update_own ON public.compose_history;
CREATE POLICY primecut_compose_history_update_own
  ON public.compose_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

COMMIT;
