CREATE TABLE public.player_login_homes (
  login text PRIMARY KEY,
  home_ip text NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  set_by uuid
);
GRANT ALL ON public.player_login_homes TO service_role;
ALTER TABLE public.player_login_homes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.player_login_homes IS 'Multi/Triple Room home internet address per provider login; first box linked sets it. Server-only.';