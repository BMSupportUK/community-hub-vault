ALTER TABLE public.fantasy_players ADD COLUMN IF NOT EXISTS alt_position text;
ALTER TABLE public.fantasy_players DROP CONSTRAINT IF EXISTS fantasy_players_alt_position_check;
ALTER TABLE public.fantasy_players ADD CONSTRAINT fantasy_players_alt_position_check CHECK (alt_position IS NULL OR alt_position = ANY (ARRAY['gk','def','mid','fwd']));