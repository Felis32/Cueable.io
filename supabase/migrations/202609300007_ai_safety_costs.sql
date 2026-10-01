BEGIN;

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS model_id text,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12, 8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS moderation_status text CHECK (moderation_status IN ('passed', 'blocked', 'unavailable')),
  ADD COLUMN IF NOT EXISTS moderation_provider text,
  ADD COLUMN IF NOT EXISTS moderation_categories jsonb;

COMMIT;