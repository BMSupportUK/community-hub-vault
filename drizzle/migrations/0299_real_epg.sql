CREATE TABLE public.epg_feeds (
  code text PRIMARY KEY,
  imported_at timestamptz,
  channels integer NOT NULL DEFAULT 0,
  matched integer NOT NULL DEFAULT 0,
  programmes integer NOT NULL DEFAULT 0,
  error text
);
GRANT SELECT ON public.epg_feeds TO authenticated;
GRANT ALL ON public.epg_feeds TO service_role;
ALTER TABLE public.epg_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read guide feeds" ON public.epg_feeds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE TABLE public.epg_programmes (
  feed text NOT NULL,
  epg_id text NOT NULL,
  start_at timestamptz NOT NULL,
  stop_at timestamptz NOT NULL,
  title text NOT NULL,
  descr text NOT NULL DEFAULT '',
  PRIMARY KEY (feed, epg_id, start_at)
);
CREATE INDEX epg_programmes_lookup ON public.epg_programmes (feed, epg_id, stop_at);
GRANT ALL ON public.epg_programmes TO service_role;
ALTER TABLE public.epg_programmes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.epg_channel_map (
  channel_key text PRIMARY KEY,
  channel_name text NOT NULL,
  category text NOT NULL DEFAULT '',
  feed text,
  epg_id text,
  epg_name text,
  manual boolean NOT NULL DEFAULT false,
  disabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX epg_channel_map_feed ON public.epg_channel_map (feed);
GRANT SELECT, UPDATE ON public.epg_channel_map TO authenticated;
GRANT ALL ON public.epg_channel_map TO service_role;
ALTER TABLE public.epg_channel_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read guide matches" ON public.epg_channel_map FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "Admin and management fix guide matches" ON public.epg_channel_map FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));