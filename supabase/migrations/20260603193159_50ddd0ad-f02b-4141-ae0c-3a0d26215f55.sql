
ALTER TABLE public.streaming_devices
  ADD COLUMN IF NOT EXISTS price_range_low_cents integer,
  ADD COLUMN IF NOT EXISTS price_range_high_cents integer,
  ADD COLUMN IF NOT EXISTS price_range_currency text NOT NULL DEFAULT 'GBP';
