ALTER TABLE public.app_builds ADD COLUMN IF NOT EXISTS announce_updates boolean NOT NULL DEFAULT false;
UPDATE public.app_builds SET announce_updates = true WHERE app_name = 'BM Store App';