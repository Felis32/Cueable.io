BEGIN;

ALTER TABLE public.home_content
  DROP CONSTRAINT IF EXISTS home_content_section_check;

ALTER TABLE public.home_content
  ADD CONSTRAINT home_content_section_check
  CHECK (section IN ('features', 'examples', 'client_work'));

NOTIFY pgrst, 'reload schema';

COMMIT;