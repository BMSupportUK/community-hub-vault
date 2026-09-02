CREATE TABLE public.credential_change_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credential_change_events TO authenticated;
GRANT ALL ON public.credential_change_events TO service_role;

ALTER TABLE public.credential_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and staff can read credential change events"
ON public.credential_change_events
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role, 'staff'::app_role])
);

CREATE INDEX credential_change_events_changed_at_idx
  ON public.credential_change_events (changed_at DESC);

CREATE OR REPLACE FUNCTION public.tg_log_credential_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.credential_change_events (credential_id, owner_id)
  VALUES (NEW.id, NEW.owner_id);
  DELETE FROM public.credential_change_events WHERE changed_at < now() - interval '1 day';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_log_credential_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER app_credentials_log_change
AFTER INSERT OR UPDATE ON private.app_credentials
FOR EACH ROW EXECUTE FUNCTION public.tg_log_credential_change();

ALTER PUBLICATION supabase_realtime ADD TABLE public.credential_change_events;