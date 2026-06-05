
CREATE TABLE public.streaming_device_ratings (
  device_id uuid NOT NULL REFERENCES public.streaming_devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.streaming_device_ratings TO authenticated;
GRANT ALL ON public.streaming_device_ratings TO service_role;

ALTER TABLE public.streaming_device_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device ratings read approved" ON public.streaming_device_ratings
  FOR SELECT TO authenticated
  USING ((NOT has_role(auth.uid(), 'pending'::app_role)) AND (NOT has_role(auth.uid(), 'banned'::app_role)));

CREATE POLICY "device ratings insert self" ON public.streaming_device_ratings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (NOT has_role(auth.uid(), 'pending'::app_role)) AND (NOT has_role(auth.uid(), 'banned'::app_role)));

CREATE POLICY "device ratings update self" ON public.streaming_device_ratings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "device ratings delete self" ON public.streaming_device_ratings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER streaming_device_ratings_set_updated_at
  BEFORE UPDATE ON public.streaming_device_ratings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
