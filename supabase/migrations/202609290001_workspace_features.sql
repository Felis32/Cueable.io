BEGIN;

DO $$
DECLARE
  missing_columns text;
BEGIN
  IF to_regclass('public.projects') IS NULL OR to_regclass('public.videos') IS NULL THEN
    RAISE EXCEPTION 'Safe setup stopped: existing public.projects and public.videos tables are required. No changes were applied.';
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO missing_columns
  FROM (VALUES
    ('projects', 'id'),
    ('projects', 'user_id'),
    ('projects', 'name'),
    ('projects', 'prompt'),
    ('projects', 'source_type'),
    ('projects', 'source_url'),
    ('projects', 'status'),
    ('videos', 'project_id'),
    ('videos', 'user_id'),
    ('videos', 'title'),
    ('videos', 'storage_path'),
    ('videos', 'status'),
    ('videos', 'duration'),
    ('videos', 'created_at'),
    ('assets', 'id'),
    ('assets', 'user_id'),
    ('assets', 'name'),
    ('assets', 'url'),
    ('assets', 'type'),
    ('assets', 'created_at'),
    ('brand_kits', 'user_id'),
    ('home_content', 'id'),
    ('home_content', 'section'),
    ('home_content', 'title'),
    ('templates', 'id'),
    ('templates', 'title'),
    ('templates', 'category'),
    ('templates', 'duration'),
    ('templates', 'ratio'),
    ('templates', 'tint')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
    AND actual.table_name = required.table_name
    AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL
    AND to_regclass('public.' || required.table_name) IS NOT NULL;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Safe setup stopped because required existing columns are missing: %. No changes were applied.', missing_columns;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_users'
      AND column_name = 'user_id'
      AND data_type <> 'uuid'
  ) THEN
    RAISE EXCEPTION 'Safe setup stopped: existing admin_users.user_id is not UUID. Review the legacy admin table before linking rows to auth.users.';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'assets' AND public IS DISTINCT FROM true)
    OR EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'brand-kits' AND public IS DISTINCT FROM true)
    OR EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos' AND public IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'Safe setup stopped: existing assets/brand-kits buckets must be public and videos must be private. Review bucket privacy manually; no changes were applied.';
  END IF;

  IF to_regclass('public.brand_kits') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.brand_kits WHERE user_id IS NULL) THEN
      RAISE EXCEPTION 'Safe setup stopped: brand_kits contains rows without user_id. Review those rows before adding the unique owner index. No changes were applied.';
    END IF;

    IF EXISTS (SELECT user_id FROM public.brand_kits GROUP BY user_id HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'Safe setup stopped: brand_kits has multiple rows for a user. Merge them manually before applying this setup. No changes were applied.';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  type text NOT NULL DEFAULT 'application/octet-stream',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_kits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#111111',
  secondary_color text NOT NULL DEFAULT '#d9c7b5',
  accent_color text NOT NULL DEFAULT '#b86a4d',
  neutral_color text NOT NULL DEFAULT '#f4f1ee',
  tint_color text NOT NULL DEFAULT '#f1e6dd',
  overlay_color text NOT NULL DEFAULT '#000000',
  other_color text NOT NULL DEFAULT '#f7efe5',
  end_card text NOT NULL DEFAULT 'Made with Primecut',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#111111',
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#d9c7b5',
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#b86a4d',
  ADD COLUMN IF NOT EXISTS neutral_color text NOT NULL DEFAULT '#f4f1ee',
  ADD COLUMN IF NOT EXISTS tint_color text NOT NULL DEFAULT '#f1e6dd',
  ADD COLUMN IF NOT EXISTS overlay_color text NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS other_color text NOT NULL DEFAULT '#f7efe5',
  ADD COLUMN IF NOT EXISTS end_card text NOT NULL DEFAULT 'Made with Primecut',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS brand_kits_user_id_uidx
  ON public.brand_kits (user_id);

CREATE TABLE IF NOT EXISTS public.home_content (
  id text PRIMARY KEY,
  section text NOT NULL CHECK (section IN ('features', 'examples')),
  title text NOT NULL,
  body text,
  meta text,
  media_type text,
  media_url text,
  text_content text,
  tint text,
  kind text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.templates (
  id text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  duration text NOT NULL,
  ratio text NOT NULL,
  tint text NOT NULL,
  source text NOT NULL DEFAULT 'custom',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text PRIMARY KEY CHECK (email = lower(trim(email))),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email text;

DO $$
BEGIN
  UPDATE public.admin_users AS admins
  SET email = lower(users.email)
  FROM auth.users AS users
  WHERE admins.email IS NULL
    AND admins.user_id = users.id
    AND users.email IS NOT NULL;

  IF EXISTS (
    SELECT email
    FROM public.admin_users
    WHERE email IS NOT NULL
    GROUP BY email
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Safe setup stopped: admin_users contains duplicate email values. Review those rows before adding the unique email index.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_uidx
  ON public.admin_users (email);

CREATE OR REPLACE FUNCTION public.is_primecut_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE email = lower(auth.jwt() ->> 'email')
  );
$$;

REVOKE ALL ON public.admin_users FROM anon, authenticated;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.is_primecut_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_primecut_admin() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.compose_history (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compose_history_user_created_idx
  ON public.compose_history (user_id, created_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compose_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.projects TO authenticated;
GRANT SELECT, INSERT ON public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.brand_kits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.home_content, public.templates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.home_content, public.templates TO authenticated;
GRANT SELECT, INSERT ON public.compose_history TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'primecut_projects_read_own') THEN
    EXECUTE 'CREATE POLICY primecut_projects_read_own ON public.projects FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'primecut_projects_insert_own') THEN
    EXECUTE 'CREATE POLICY primecut_projects_insert_own ON public.projects FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assets' AND policyname = 'primecut_assets_read_own') THEN
    EXECUTE 'CREATE POLICY primecut_assets_read_own ON public.assets FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assets' AND policyname = 'primecut_assets_insert_own') THEN
    EXECUTE 'CREATE POLICY primecut_assets_insert_own ON public.assets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'brand_kits' AND policyname = 'primecut_brand_kits_read_own') THEN
    EXECUTE 'CREATE POLICY primecut_brand_kits_read_own ON public.brand_kits FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'brand_kits' AND policyname = 'primecut_brand_kits_write_own') THEN
    EXECUTE 'CREATE POLICY primecut_brand_kits_write_own ON public.brand_kits FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'home_content' AND policyname = 'primecut_home_content_public_read') THEN
    EXECUTE 'CREATE POLICY primecut_home_content_public_read ON public.home_content FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'home_content' AND policyname = 'primecut_home_content_admin_write') THEN
    EXECUTE 'CREATE POLICY primecut_home_content_admin_write ON public.home_content FOR ALL TO authenticated USING (public.is_primecut_admin()) WITH CHECK (public.is_primecut_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'templates' AND policyname = 'primecut_templates_public_read') THEN
    EXECUTE 'CREATE POLICY primecut_templates_public_read ON public.templates FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'templates' AND policyname = 'primecut_templates_admin_write') THEN
    EXECUTE 'CREATE POLICY primecut_templates_admin_write ON public.templates FOR ALL TO authenticated USING (public.is_primecut_admin()) WITH CHECK (public.is_primecut_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'compose_history' AND policyname = 'primecut_compose_history_read_own') THEN
    EXECUTE 'CREATE POLICY primecut_compose_history_read_own ON public.compose_history FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'compose_history' AND policyname = 'primecut_compose_history_insert_own') THEN
    EXECUTE 'CREATE POLICY primecut_compose_history_insert_own ON public.compose_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('assets', 'assets', true),
  ('videos', 'videos', false),
  ('brand-kits', 'brand-kits', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'primecut_assets_storage_read_own') THEN
    EXECUTE 'CREATE POLICY primecut_assets_storage_read_own ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''assets'' AND (storage.foldername(name))[1] = auth.uid()::text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'primecut_assets_storage_insert_own') THEN
    EXECUTE 'CREATE POLICY primecut_assets_storage_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''assets'' AND (storage.foldername(name))[1] = auth.uid()::text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'primecut_assets_storage_update_own') THEN
    EXECUTE 'CREATE POLICY primecut_assets_storage_update_own ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''assets'' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = ''assets'' AND (storage.foldername(name))[1] = auth.uid()::text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'primecut_brand_storage_read_own') THEN
    EXECUTE 'CREATE POLICY primecut_brand_storage_read_own ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''brand-kits'' AND (storage.foldername(name))[1] = auth.uid()::text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'primecut_brand_storage_insert_own') THEN
    EXECUTE 'CREATE POLICY primecut_brand_storage_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''brand-kits'' AND (storage.foldername(name))[1] = auth.uid()::text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'primecut_brand_storage_update_own') THEN
    EXECUTE 'CREATE POLICY primecut_brand_storage_update_own ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''brand-kits'' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = ''brand-kits'' AND (storage.foldername(name))[1] = auth.uid()::text)';
  END IF;
END $$;

COMMIT;