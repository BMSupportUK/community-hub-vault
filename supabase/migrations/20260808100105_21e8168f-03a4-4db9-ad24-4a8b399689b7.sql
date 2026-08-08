ALTER TABLE public.fantasy_players ADD COLUMN IF NOT EXISTS departed_at timestamptz;
UPDATE public.fantasy_players SET departed_at = COALESCE(departed_at, updated_at) WHERE status = 'departed';