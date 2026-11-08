CREATE TABLE public.epg_feed_channels (
  feed text NOT NULL,
  epg_id text NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (feed, epg_id)
);
CREATE INDEX epg_feed_channels_name ON public.epg_feed_channels (lower(name));
GRANT SELECT ON public.epg_feed_channels TO authenticated;
GRANT ALL ON public.epg_feed_channels TO service_role;
ALTER TABLE public.epg_feed_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read guide channels" ON public.epg_feed_channels FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));