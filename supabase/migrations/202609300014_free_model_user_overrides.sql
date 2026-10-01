BEGIN;

CREATE TABLE IF NOT EXISTS public.free_model_user_overrides (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_cap integer CHECK (daily_cap IS NULL OR daily_cap BETWEEN 0 AND 10000),
  model_id text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.free_model_user_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_model_user_overrides FROM anon, authenticated;
GRANT ALL ON public.free_model_user_overrides TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;