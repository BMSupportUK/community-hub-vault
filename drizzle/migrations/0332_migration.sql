CREATE TABLE public.player_channel_subtitles (
  channel_key text PRIMARY KEY,
  channel_name text NOT NULL,
  has_subtitles boolean NOT NULL DEFAULT false,
  languages text,
  checks integer NOT NULL DEFAULT 1,
  checks_with_subs integer NOT NULL DEFAULT 0,
  first_checked_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_channel_subtitles TO service_role;
ALTER TABLE public.player_channel_subtitles ENABLE ROW LEVEL SECURITY;