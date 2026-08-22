CREATE TABLE IF NOT EXISTS public.boro_espn_summary_cache (
  event_id text PRIMARY KEY,
  slug text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.boro_espn_summary_cache TO service_role;

ALTER TABLE public.boro_espn_summary_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS boro_espn_summary_cache_updated_idx ON public.boro_espn_summary_cache (updated_at DESC);