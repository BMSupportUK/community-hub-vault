ALTER TABLE public.fantasy_players
  ADD COLUMN IF NOT EXISTS status_locked boolean NOT NULL DEFAULT false;