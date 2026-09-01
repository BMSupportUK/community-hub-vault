ALTER TABLE public.app_builds
  ADD COLUMN IF NOT EXISTS app_name text,
  ADD COLUMN IF NOT EXISTS video_path text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS app_builds_sort_idx ON public.app_builds (sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS app_transfers_user_build_idx ON public.app_transfers (user_id, build_id);