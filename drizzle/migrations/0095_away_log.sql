-- Away periods need a history: user_dnd_status only keeps the current window, so shift
-- reports had nothing to list. One row per Away window, written by the trigger below.
CREATE TABLE public.away_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('Toilet Break','Smoking Break','Meeting','Outside Of Office Hours')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX away_log_user_starts_idx ON public.away_log (user_id, starts_at DESC);
GRANT SELECT ON public.away_log TO authenticated;
GRANT ALL ON public.away_log TO service_role;
ALTER TABLE public.away_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own away log" ON public.away_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Staff view all away log" ON public.away_log FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::public.app_role[]));
CREATE OR REPLACE FUNCTION public.log_away_period() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _open public.away_log%ROWTYPE;
BEGIN
  IF NEW.enabled THEN
    SELECT * INTO _open FROM public.away_log WHERE user_id = NEW.user_id AND ends_at IS NULL ORDER BY starts_at DESC LIMIT 1;
    -- An identical save (same reason, same window) is not a new away period.
    IF FOUND AND _open.reason = COALESCE(NEW.reason, 'Away') AND _open.starts_at = COALESCE(NEW.starts_at, now()) AND _open.ends_at IS NOT DISTINCT FROM NEW.ends_at THEN
      RETURN NEW;
    END IF;
    UPDATE public.away_log SET ends_at = COALESCE(NEW.starts_at, now()) WHERE user_id = NEW.user_id AND ends_at IS NULL AND starts_at < COALESCE(NEW.starts_at, now());
    INSERT INTO public.away_log (user_id, reason, starts_at, ends_at) VALUES (NEW.user_id, COALESCE(NEW.reason, 'Away'), COALESCE(NEW.starts_at, now()), NEW.ends_at);
  ELSE
    UPDATE public.away_log SET ends_at = COALESCE(NEW.ends_at, now()) WHERE user_id = NEW.user_id AND ends_at IS NULL;
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER log_away_period AFTER INSERT OR UPDATE OF enabled, starts_at, ends_at, reason ON public.user_dnd_status FOR EACH ROW EXECUTE FUNCTION public.log_away_period();
REVOKE EXECUTE ON FUNCTION public.log_away_period() FROM PUBLIC, anon, authenticated;
-- Carry the window each account is sitting in right now into today's report.
INSERT INTO public.away_log (user_id, reason, starts_at, ends_at)
SELECT d.user_id, COALESCE(d.reason, 'Away'), COALESCE(d.starts_at, d.updated_at), d.ends_at
FROM public.user_dnd_status d
WHERE d.enabled AND NOT EXISTS (SELECT 1 FROM public.away_log l WHERE l.user_id = d.user_id AND l.ends_at IS NULL);