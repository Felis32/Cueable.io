BEGIN;

CREATE TABLE IF NOT EXISTS public.free_models (
  id text PRIMARY KEY,
  label text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen timestamptz,
  healthy boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 1000 CHECK (priority >= 0),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS free_models_selection_idx
  ON public.free_models (enabled, healthy, priority, id);

ALTER TABLE public.free_models ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.free_models TO authenticated;
GRANT ALL ON public.free_models TO service_role;

DROP POLICY IF EXISTS free_models_admin_select ON public.free_models;
CREATE POLICY free_models_admin_select
  ON public.free_models FOR SELECT TO authenticated
  USING (public.is_primecut_admin());

DROP POLICY IF EXISTS free_models_admin_update ON public.free_models;
CREATE POLICY free_models_admin_update
  ON public.free_models FOR UPDATE TO authenticated
  USING (public.is_primecut_admin())
  WITH CHECK (public.is_primecut_admin());

COMMIT;