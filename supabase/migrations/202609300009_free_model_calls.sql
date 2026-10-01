BEGIN;

CREATE TABLE IF NOT EXISTS public.free_model_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_id uuid REFERENCES public.ai_usage(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  task text NOT NULL CHECK (task IN ('chat', 'brief', 'plan')),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  success boolean NOT NULL,
  error_code text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS free_model_calls_user_created_idx
  ON public.free_model_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS free_model_calls_model_created_idx
  ON public.free_model_calls (model_id, created_at DESC);

ALTER TABLE public.free_model_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_model_calls FROM anon, authenticated;
GRANT ALL ON public.free_model_calls TO service_role;

COMMIT;