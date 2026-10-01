BEGIN;

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'done')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  cost numeric(12, 4) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  model text NOT NULL,
  error text,
  input jsonb NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  credits_reserved integer NOT NULL DEFAULT 0 CHECK (credits_reserved >= 0),
  credits_refunded integer NOT NULL DEFAULT 0 CHECK (credits_refunded >= 0 AND credits_refunded <= credits_reserved),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.generation_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.generation_jobs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_number integer NOT NULL CHECK (scene_number > 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'done')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  seconds integer NOT NULL CHECK (seconds > 0),
  visual_description text NOT NULL,
  on_screen_text text NOT NULL DEFAULT '',
  voiceover_line text NOT NULL DEFAULT '',
  output_path text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, scene_number)
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_jobs_user_created_idx
  ON public.generation_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_jobs_queue_idx
  ON public.generation_jobs (created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS generation_scenes_job_number_idx
  ON public.generation_scenes (job_id, scene_number);
CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications (user_id, created_at DESC);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.generation_jobs, public.generation_scenes TO authenticated;
GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.generation_jobs, public.generation_scenes, public.user_notifications TO service_role;

DROP POLICY IF EXISTS generation_jobs_select_own ON public.generation_jobs;
CREATE POLICY generation_jobs_select_own
  ON public.generation_jobs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS generation_scenes_select_own ON public.generation_scenes;
CREATE POLICY generation_scenes_select_own
  ON public.generation_scenes FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.generation_jobs
      WHERE generation_jobs.id = generation_scenes.job_id
        AND generation_jobs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_notifications_select_own ON public.user_notifications;
CREATE POLICY user_notifications_select_own
  ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_notifications_update_own ON public.user_notifications;
CREATE POLICY user_notifications_update_own
  ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.claim_generation_job(p_job_id uuid)
RETURNS SETOF public.generation_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.generation_jobs
  SET status = 'running',
      progress = greatest(progress, 1),
      attempt_count = attempt_count + 1,
      started_at = coalesce(started_at, now()),
      updated_at = now(),
      error = NULL
  WHERE id = p_job_id AND status = 'queued'
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.refund_generation_job_credits(p_job_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.generation_jobs
  SET credits_refunded = credits_reserved,
      updated_at = now()
  WHERE id = p_job_id AND status = 'failed'
  RETURNING credits_refunded;
$$;

REVOKE ALL ON FUNCTION public.claim_generation_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_generation_job_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_generation_job_credits(uuid) TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_scenes;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMIT;