ALTER TABLE public.fantasy_players
  ADD COLUMN IF NOT EXISTS in_25_squad boolean NOT NULL DEFAULT true;