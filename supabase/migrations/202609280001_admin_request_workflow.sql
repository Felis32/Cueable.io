-- projects is the existing customer-request table; workflow_status is kept
-- separate from the legacy generation status used by existing app screens.
DO $$
BEGIN
  CREATE TYPE public.request_status AS ENUM (
    'new',
    'in_progress',
    'in_review',
    'delivered',
    'revision_requested',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS workflow_status public.request_status,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.projects
SET workflow_status = CASE lower(coalesce(status::text, ''))
  WHEN 'processing' THEN 'in_progress'::public.request_status
  WHEN 'in_progress' THEN 'in_progress'::public.request_status
  WHEN 'in_review' THEN 'in_review'::public.request_status
  WHEN 'delivered' THEN 'delivered'::public.request_status
  WHEN 'revision_requested' THEN 'revision_requested'::public.request_status
  WHEN 'completed' THEN 'delivered'::public.request_status
  WHEN 'ready' THEN 'delivered'::public.request_status
  WHEN 'approved' THEN 'delivered'::public.request_status
  WHEN 'done' THEN 'delivered'::public.request_status
  WHEN 'success' THEN 'delivered'::public.request_status
  ELSE 'new'::public.request_status
END
WHERE workflow_status IS NULL;

UPDATE public.projects
SET workflow_status_changed_at = coalesce(created_at, now())
WHERE workflow_status_changed_at IS NULL;

ALTER TABLE public.projects
  ALTER COLUMN workflow_status SET DEFAULT 'new',
  ALTER COLUMN workflow_status SET NOT NULL,
  ALTER COLUMN workflow_status_changed_at SET DEFAULT now(),
  ALTER COLUMN workflow_status_changed_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_request_workflow_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.workflow_status IS DISTINCT FROM OLD.workflow_status THEN
    NEW.workflow_status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_workflow_timestamps ON public.projects;
CREATE TRIGGER projects_workflow_timestamps
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.set_request_workflow_timestamps();

CREATE INDEX IF NOT EXISTS projects_workflow_status_created_idx
  ON public.projects (workflow_status, created_at);
CREATE INDEX IF NOT EXISTS projects_assigned_to_idx
  ON public.projects (assigned_to) WHERE assigned_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.request_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  thumbnail_path text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, version_number)
);

CREATE INDEX IF NOT EXISTS request_versions_request_created_idx
  ON public.request_versions (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS request_versions_delivered_idx
  ON public.request_versions (request_id, delivered_at DESC)
  WHERE is_delivered;

CREATE TABLE IF NOT EXISTS public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL CHECK (length(trim(note)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_notes_request_created_idx
  ON public.internal_notes (request_id, created_at);

CREATE TABLE IF NOT EXISTS public.request_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status public.request_status,
  to_status public.request_status,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_activity_request_created_idx
  ON public.request_activity (request_id, created_at DESC);

INSERT INTO public.request_versions (
  request_id,
  version_number,
  title,
  storage_path,
  is_delivered,
  delivered_at,
  created_at
)
SELECT
  ranked.project_id,
  ranked.version_number,
  coalesce(ranked.title, 'Version ' || ranked.version_number::text),
  ranked.storage_path,
  ranked.version_number = ranked.latest_version
    AND lower(coalesce(ranked.project_status, '')) IN ('completed', 'delivered', 'ready', 'approved', 'done', 'success'),
  CASE
    WHEN ranked.version_number = ranked.latest_version
      AND lower(coalesce(ranked.project_status, '')) IN ('completed', 'delivered', 'ready', 'approved', 'done', 'success')
    THEN ranked.video_created_at
    ELSE NULL
  END,
  coalesce(ranked.video_created_at, now())
FROM (
  SELECT
    videos.project_id,
    videos.title,
    videos.storage_path,
    videos.created_at AS video_created_at,
    projects.status AS project_status,
    row_number() OVER (PARTITION BY videos.project_id ORDER BY videos.created_at, videos.storage_path)::integer AS version_number,
    count(*) OVER (PARTITION BY videos.project_id)::integer AS latest_version
  FROM public.videos AS videos
  JOIN public.projects AS projects ON projects.id = videos.project_id
) AS ranked
ON CONFLICT (request_id, version_number) DO NOTHING;

ALTER TABLE public.request_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_activity ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.request_versions FROM anon, authenticated;
REVOKE ALL ON public.internal_notes FROM anon, authenticated;
REVOKE ALL ON public.request_activity FROM anon, authenticated;
GRANT SELECT ON public.request_versions TO authenticated;

DROP POLICY IF EXISTS customers_read_delivered_request_versions ON public.request_versions;
CREATE POLICY customers_read_delivered_request_versions
  ON public.request_versions
  FOR SELECT
  TO authenticated
  USING (
    is_delivered
    AND delivered_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = request_versions.request_id
        AND projects.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.request_versions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
