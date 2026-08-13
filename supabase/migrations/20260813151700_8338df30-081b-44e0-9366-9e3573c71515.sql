ALTER TABLE public.streaming_device_prices
  ADD COLUMN IF NOT EXISTS stock_checked_at TIMESTAMPTZ;

UPDATE public.streaming_device_prices SET stock_checked_at = scraped_at WHERE stock_checked_at IS NULL;