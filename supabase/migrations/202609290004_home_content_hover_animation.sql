BEGIN;

ALTER TABLE public.home_content
  ADD COLUMN IF NOT EXISTS hover_animation text NOT NULL DEFAULT 'none'
  CHECK (hover_animation IN (
    'none',
    'tilt-right',
    'tilt-left',
    'shift-up',
    'shift-down',
    'slide-left',
    'slide-right',
    'zoom-in',
    'zoom-out',
    'rotate-right',
    'rotate-left',
    'flip-horizontal',
    'flip-vertical',
    'soft-glow',
    'shrink'
  ));

NOTIFY pgrst, 'reload schema';

COMMIT;