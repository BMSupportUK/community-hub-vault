ALTER TABLE public.user_dnd_status ADD COLUMN IF NOT EXISTS reason text;
UPDATE public.user_dnd_status SET reason = 'Outside Of Office Hours' WHERE reason IS NULL;
ALTER TABLE public.user_dnd_status ADD CONSTRAINT staff_away_reason CHECK (reason IS NULL OR reason IN ('Toilet Break','Smoking Break','Meeting','Outside Of Office Hours'));
CREATE POLICY "staff away insert own" ON public.user_dnd_status FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::public.app_role[]));
CREATE POLICY "staff away update own" ON public.user_dnd_status FOR UPDATE TO authenticated USING (user_id=auth.uid() AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::public.app_role[])) WITH CHECK (user_id=auth.uid() AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::public.app_role[]));
GRANT SELECT, INSERT, UPDATE ON public.user_dnd_status TO authenticated;
GRANT ALL ON public.user_dnd_status TO service_role;
CREATE OR REPLACE FUNCTION public.validate_staff_away() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF NEW.enabled AND NEW.reason IS NOT NULL THEN
 IF NEW.reason = 'Outside Of Office Hours' THEN
  IF NEW.starts_at IS NULL OR NEW.ends_at IS NULL OR NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Outside Of Office Hours requires a valid start and finish'; END IF;
 ELSE
  IF NEW.ends_at IS NOT NULL THEN RAISE EXCEPTION 'This Away reason must be ended manually'; END IF;
 END IF;
 NEW.note := NULL;
END IF;
RETURN NEW; END $$;
CREATE TRIGGER validate_staff_away BEFORE INSERT OR UPDATE ON public.user_dnd_status FOR EACH ROW EXECUTE FUNCTION public.validate_staff_away();