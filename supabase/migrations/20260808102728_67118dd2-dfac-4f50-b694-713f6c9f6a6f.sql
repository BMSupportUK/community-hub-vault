UPDATE public.fantasy_players
SET value_m = GREATEST(3.0, ROUND((3.0 + (value_m - 3.5) * 1.7) * 2) / 2);