CREATE TABLE public.fan_zone_appeals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','replied','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fan_zone_appeal_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appeal_id uuid NOT NULL REFERENCES public.fan_zone_appeals(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  from_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fan_zone_appeals_user_idx ON public.fan_zone_appeals(user_id);
CREATE INDEX fan_zone_appeal_messages_appeal_idx ON public.fan_zone_appeal_messages(appeal_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.fan_zone_appeals TO authenticated;
GRANT ALL ON public.fan_zone_appeals TO service_role;
GRANT SELECT, INSERT ON public.fan_zone_appeal_messages TO authenticated;
GRANT ALL ON public.fan_zone_appeal_messages TO service_role;

ALTER TABLE public.fan_zone_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_zone_appeal_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fan_zone_appeal_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(
    auth.uid(),
    ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]
  )
$$;

GRANT EXECUTE ON FUNCTION public.fan_zone_appeal_staff() TO authenticated;

CREATE POLICY "Members read their own appeal"
ON public.fan_zone_appeals FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.fan_zone_appeal_staff());

CREATE POLICY "Members open their own appeal"
ON public.fan_zone_appeals FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff update appeals"
ON public.fan_zone_appeals FOR UPDATE TO authenticated
USING (public.fan_zone_appeal_staff())
WITH CHECK (public.fan_zone_appeal_staff());

CREATE POLICY "Read messages on visible appeals"
ON public.fan_zone_appeal_messages FOR SELECT TO authenticated
USING (
  public.fan_zone_appeal_staff()
  OR EXISTS (
    SELECT 1 FROM public.fan_zone_appeals a
    WHERE a.id = appeal_id AND a.user_id = auth.uid()
  )
);

CREATE POLICY "Write messages on own appeal or as staff"
ON public.fan_zone_appeal_messages FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    (from_staff AND public.fan_zone_appeal_staff())
    OR (NOT from_staff AND EXISTS (
      SELECT 1 FROM public.fan_zone_appeals a
      WHERE a.id = appeal_id AND a.user_id = auth.uid()
    ))
  )
);

CREATE OR REPLACE FUNCTION public.fan_zone_appeal_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.fan_zone_appeals
     SET updated_at = now(),
         status = CASE WHEN NEW.from_staff THEN 'replied' ELSE 'open' END
   WHERE id = NEW.appeal_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fan_zone_appeal_messages_touch
AFTER INSERT ON public.fan_zone_appeal_messages
FOR EACH ROW EXECUTE FUNCTION public.fan_zone_appeal_touch();