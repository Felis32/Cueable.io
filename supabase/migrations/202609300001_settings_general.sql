BEGIN;

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  language text NOT NULL DEFAULT 'en',
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  default_landing_page text NOT NULL DEFAULT 'home' CHECK (default_landing_page IN ('home', 'compose')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Cueable studio',
  slug text,
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_settings_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_settings_slug_uidx
  ON public.workspace_settings (slug)
  WHERE slug IS NOT NULL;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_settings TO authenticated;

DROP POLICY IF EXISTS user_settings_read_own ON public.user_settings;
CREATE POLICY user_settings_read_own
  ON public.user_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_write_own ON public.user_settings;
CREATE POLICY user_settings_write_own
  ON public.user_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS workspace_settings_read_own ON public.workspace_settings;
CREATE POLICY workspace_settings_read_own
  ON public.workspace_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS workspace_settings_write_own ON public.workspace_settings;
CREATE POLICY workspace_settings_write_own
  ON public.workspace_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;