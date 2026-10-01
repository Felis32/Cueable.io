BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_free_model_quota(
  p_usage_id uuid,
  p_user_id uuid,
  p_plan text,
  p_model_id text,
  p_task text,
  p_global_daily_budget integer,
  p_user_daily_cap integer
)
RETURNS TABLE (allowed boolean, error_code text, global_remaining integer, user_remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  global_used integer;
  user_used integer;
BEGIN
  IF p_usage_id IS NULL
    OR p_user_id IS NULL
    OR p_plan IS NULL
    OR p_plan NOT IN ('free', 'pro', 'business')
    OR p_model_id IS NULL
    OR p_task IS NULL
    OR p_task NOT IN ('chat', 'brief', 'plan')
    OR p_global_daily_budget IS NULL
    OR p_global_daily_budget < 0
    OR p_user_daily_cap IS NULL
    OR p_user_daily_cap < 0 THEN
    RAISE EXCEPTION 'Invalid free model quota reservation parameters.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('openrouter-free-daily-budget', 0));

  SELECT (count(DISTINCT usage_id) + count(*) FILTER (WHERE usage_id IS NULL))::integer INTO global_used
  FROM public.free_model_quota_usage
  WHERE created_at >= day_start;

  SELECT (count(DISTINCT usage_id) + count(*) FILTER (WHERE usage_id IS NULL))::integer INTO user_used
  FROM public.free_model_quota_usage
  WHERE user_id = p_user_id AND created_at >= day_start;

  IF EXISTS (
    SELECT 1
    FROM public.free_model_quota_usage
    WHERE usage_id = p_usage_id AND user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT true, NULL::text,
      greatest(p_global_daily_budget - global_used, 0),
      greatest(p_user_daily_cap - user_used, 0);
    RETURN;
  END IF;

  IF global_used >= p_global_daily_budget THEN
    RETURN QUERY SELECT false, 'global_daily_budget'::text, 0, greatest(p_user_daily_cap - user_used, 0);
    RETURN;
  END IF;

  IF user_used >= p_user_daily_cap THEN
    RETURN QUERY SELECT false, 'user_daily_cap'::text, greatest(p_global_daily_budget - global_used, 0), 0;
    RETURN;
  END IF;

  INSERT INTO public.free_model_quota_usage (usage_id, user_id, plan, model_id, task)
  VALUES (p_usage_id, p_user_id, p_plan, p_model_id, p_task);

  RETURN QUERY SELECT true, NULL::text,
    greatest(p_global_daily_budget - global_used - 1, 0),
    greatest(p_user_daily_cap - user_used - 1, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_free_model_quota(uuid, uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_free_model_quota(uuid, uuid, text, text, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;