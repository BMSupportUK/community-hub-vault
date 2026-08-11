ALTER TABLE public.fantasy_players
  ADD COLUMN IF NOT EXISTS shirt_number_locked boolean NOT NULL DEFAULT false;