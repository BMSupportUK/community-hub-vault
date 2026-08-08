ALTER TABLE public.fantasy_players DROP CONSTRAINT fantasy_players_status_check;
ALTER TABLE public.fantasy_players ADD CONSTRAINT fantasy_players_status_check CHECK (status = ANY (ARRAY['active'::text,'injured'::text,'suspended'::text,'departed'::text,'loaned_out'::text]));
ALTER TABLE public.fantasy_players ADD COLUMN IF NOT EXISTS loan_club text;