BEGIN;

ALTER TABLE public.brand_kits
  ALTER COLUMN end_card SET DEFAULT 'Made with Cueable';

UPDATE public.brand_kits
SET end_card = 'Made with Cueable'
WHERE end_card = 'Made with Primecut';

NOTIFY pgrst, 'reload schema';

COMMIT;