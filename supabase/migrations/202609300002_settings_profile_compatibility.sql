BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'Email_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN "Email_id" DROP NOT NULL;
  END IF;
END $$;

UPDATE public.user_settings SET theme = 'light' WHERE theme = 'system';
ALTER TABLE public.user_settings ALTER COLUMN theme SET DEFAULT 'light';
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_theme_check;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_theme_check CHECK (theme IN ('light', 'dark'));

COMMIT;