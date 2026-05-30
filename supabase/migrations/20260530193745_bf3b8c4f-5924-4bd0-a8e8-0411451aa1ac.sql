
CREATE TABLE public.streaming_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text,
  tier text NOT NULL CHECK (tier IN ('high','medium')),
  image_url text,
  summary text,
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  sideload_notes text,
  amazon_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.streaming_devices TO authenticated;
GRANT ALL ON public.streaming_devices TO service_role;

ALTER TABLE public.streaming_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active devices"
  ON public.streaming_devices FOR SELECT
  TO authenticated
  USING (is_active OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins manage devices insert"
  ON public.streaming_devices FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins manage devices update"
  ON public.streaming_devices FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins manage devices delete"
  ON public.streaming_devices FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER streaming_devices_set_updated_at
  BEFORE UPDATE ON public.streaming_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.streaming_device_prices (
  device_id uuid PRIMARY KEY REFERENCES public.streaming_devices(id) ON DELETE CASCADE,
  price_cents integer,
  currency text NOT NULL DEFAULT 'GBP',
  availability text,
  source_url text,
  scraped_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.streaming_device_prices TO authenticated;
GRANT ALL ON public.streaming_device_prices TO service_role;

ALTER TABLE public.streaming_device_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view prices"
  ON public.streaming_device_prices FOR SELECT
  TO authenticated
  USING (true);
