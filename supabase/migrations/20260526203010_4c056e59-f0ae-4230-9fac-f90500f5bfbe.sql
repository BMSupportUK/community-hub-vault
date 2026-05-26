
CREATE TABLE public.user_dnd_status (
  user_id UUID NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  note TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_dnd_note_length CHECK (note IS NULL OR char_length(note) <= 140),
  CONSTRAINT user_dnd_window_valid CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dnd_status TO authenticated;
GRANT ALL ON public.user_dnd_status TO service_role;

ALTER TABLE public.user_dnd_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dnd read approved"
  ON public.user_dnd_status
  FOR SELECT
  TO authenticated
  USING (
    NOT has_role(auth.uid(), 'pending'::app_role)
    AND NOT has_role(auth.uid(), 'banned'::app_role)
  );

CREATE POLICY "dnd insert self admin/mgmt"
  ON public.user_dnd_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE POLICY "dnd update self admin/mgmt"
  ON public.user_dnd_status
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  )
  WITH CHECK (
    user_id = auth.uid()
    AND has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE POLICY "dnd delete self admin/mgmt"
  ON public.user_dnd_status
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE OR REPLACE FUNCTION public.user_dnd_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_dnd_status_touch
BEFORE UPDATE ON public.user_dnd_status
FOR EACH ROW
EXECUTE FUNCTION public.user_dnd_touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_user_dnd(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_dnd_status d
    WHERE d.user_id = _user_id
      AND d.enabled = true
      AND (d.starts_at IS NULL OR d.starts_at <= now())
      AND (d.ends_at IS NULL OR d.ends_at > now())
  );
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_dnd_status;
ALTER TABLE public.user_dnd_status REPLICA IDENTITY FULL;
