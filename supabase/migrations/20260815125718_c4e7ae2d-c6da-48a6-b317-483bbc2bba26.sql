ALTER TABLE public.fantasy_squad_picks
  ADD COLUMN IF NOT EXISTS lineup_swap_note text,
  ADD COLUMN IF NOT EXISTS lineup_swapped_at timestamp with time zone;