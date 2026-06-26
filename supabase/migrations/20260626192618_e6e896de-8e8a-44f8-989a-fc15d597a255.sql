ALTER TABLE public.boro_fixtures ADD COLUMN IF NOT EXISTS home_reds integer NOT NULL DEFAULT 0;
ALTER TABLE public.boro_fixtures ADD COLUMN IF NOT EXISTS away_reds integer NOT NULL DEFAULT 0;
ALTER TABLE public.wc_fixtures ADD COLUMN IF NOT EXISTS home_reds integer NOT NULL DEFAULT 0;
ALTER TABLE public.wc_fixtures ADD COLUMN IF NOT EXISTS away_reds integer NOT NULL DEFAULT 0;