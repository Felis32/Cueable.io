BEGIN;

ALTER TABLE public.free_models
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS free_models_single_primary_idx
  ON public.free_models (is_primary)
  WHERE is_primary;

CREATE OR REPLACE FUNCTION public.set_primary_free_model(p_model_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_model_id IS NULL OR length(trim(p_model_id)) = 0 THEN
    RAISE EXCEPTION 'A model ID is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('primary-free-model', 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.free_models
    WHERE id = p_model_id AND enabled AND healthy
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.free_models SET is_primary = false WHERE is_primary;
  UPDATE public.free_models SET is_primary = true, updated_at = now() WHERE id = p_model_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_primary_free_model(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_free_model(text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;