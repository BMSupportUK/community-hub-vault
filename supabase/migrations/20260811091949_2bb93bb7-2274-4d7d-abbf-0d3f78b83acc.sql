ALTER TABLE public.fantasy_players
  ADD COLUMN IF NOT EXISTS injury_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS injury_note text,
  ADD COLUMN IF NOT EXISTS injury_return text,
  ADD COLUMN IF NOT EXISTS injury_source text,
  ADD COLUMN IF NOT EXISTS injury_updated_at timestamptz;