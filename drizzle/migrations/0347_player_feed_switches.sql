CREATE TABLE public.player_feed_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  content_id text NOT NULL DEFAULT '',
  content_name text NOT NULL DEFAULT '',
  category text,
  switch_type text NOT NULL,
  stalled boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_feed_switches TO service_role;
ALTER TABLE public.player_feed_switches ENABLE ROW LEVEL SECURITY;
CREATE INDEX player_feed_switches_time_idx ON public.player_feed_switches (occurred_at DESC);
CREATE OR REPLACE FUNCTION public.player_feed_switch_type_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.switch_type NOT IN ('picture','sound','timing','frame_rate','provider_restart') THEN RAISE EXCEPTION 'Invalid switch type'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER player_feed_switch_type BEFORE INSERT OR UPDATE ON public.player_feed_switches FOR EACH ROW EXECUTE FUNCTION public.player_feed_switch_type_check();
CREATE OR REPLACE FUNCTION public.admin_feed_switch_summary(p_hours integer DEFAULT 24)
RETURNS TABLE(content_name text, category text, switches bigint, picture bigint, sound bigint, timing bigint, frame_rate bigint, provider_restart bigint, stalled bigint, devices bigint, last_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]),false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  RETURN QUERY SELECT s.content_name, max(s.category), count(*),
    count(*) FILTER (WHERE s.switch_type='picture'), count(*) FILTER (WHERE s.switch_type='sound'),
    count(*) FILTER (WHERE s.switch_type='timing'), count(*) FILTER (WHERE s.switch_type='frame_rate'),
    count(*) FILTER (WHERE s.switch_type='provider_restart'), count(*) FILTER (WHERE s.stalled),
    count(DISTINCT s.device_id), max(s.occurred_at)
  FROM public.player_feed_switches s
  WHERE s.occurred_at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours,24), 720)))
  GROUP BY s.content_name ORDER BY count(*) DESC LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION public.admin_feed_switch_summary(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_feed_switch_summary(integer) TO authenticated;