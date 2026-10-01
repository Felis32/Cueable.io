BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_key text NOT NULL CHECK (model_key IN ('hermes', 'claude', 'openai', 'grok')),
  provider text NOT NULL CHECK (provider IN ('openrouter', 'anthropic', 'openai', 'xai')),
  plan text NOT NULL CHECK (plan IN ('free', 'pro', 'business')),
  credit_cost integer NOT NULL DEFAULT 1 CHECK (credit_cost > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed')),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx
  ON public.ai_usage (user_id, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;
GRANT ALL ON public.ai_usage TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(
  p_user_id uuid,
  p_model_key text,
  p_provider text,
  p_plan text,
  p_monthly_credit_limit integer,
  p_per_minute_limit integer
)
RETURNS TABLE (usage_id uuid, error_code text, remaining_credits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_time_utc timestamptz := now();
  month_start timestamptz;
  minute_start timestamptz;
  monthly_used integer;
  minute_used integer;
  reserved_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_monthly_credit_limit < 0 OR p_per_minute_limit < 0 THEN
    RAISE EXCEPTION 'Invalid AI usage reservation parameters.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  month_start := date_trunc('month', current_time_utc AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  minute_start := current_time_utc - interval '1 minute';

  SELECT count(*)::integer INTO minute_used
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND status IN ('reserved', 'completed')
    AND created_at >= minute_start;

  IF minute_used >= p_per_minute_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'rate_limit'::text, 0;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO monthly_used
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND status IN ('reserved', 'completed')
    AND created_at >= month_start;

  IF monthly_used >= p_monthly_credit_limit THEN
    RETURN QUERY SELECT NULL::uuid, 'credits_exhausted'::text, 0;
    RETURN;
  END IF;

  INSERT INTO public.ai_usage (user_id, model_key, provider, plan)
  VALUES (p_user_id, p_model_key, p_provider, p_plan)
  RETURNING id INTO reserved_id;

  RETURN QUERY SELECT reserved_id, NULL::text, greatest(p_monthly_credit_limit - monthly_used - 1, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, text, text, text, integer, integer) TO service_role;

COMMIT;