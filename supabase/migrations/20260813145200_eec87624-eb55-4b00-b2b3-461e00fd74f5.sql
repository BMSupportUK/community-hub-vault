ALTER TABLE public.streaming_devices ADD COLUMN IF NOT EXISTS price_watch_url text;

UPDATE public.streaming_devices SET price_watch_url = 'https://www.amazon.co.uk/Xiaomi-Streaming-Compatible-Google-Control-Black/dp/B0G52DCZMB', price_range_low_cents = 4900, price_range_high_cents = 5500, price_range_currency = 'GBP' WHERE name = 'Xiaomi TV Stick 4K (2nd Gen)';

UPDATE public.streaming_devices SET price_watch_url = 'https://www.amazon.co.uk/Xiaomi-TV-Box-3rd-Gen-black/dp/B0F3JWFL56', price_range_low_cents = 5400, price_range_high_cents = 6000, price_range_currency = 'GBP' WHERE name = 'Xiaomi TV Box S (3rd Gen)';

INSERT INTO public.streaming_device_prices (device_id, price_cents, currency, availability, source_url, scraped_at)
SELECT id, 4900, 'GBP', 'In stock', 'https://www.amazon.co.uk/Xiaomi-Streaming-Compatible-Google-Control-Black/dp/B0G52DCZMB', now()
FROM public.streaming_devices WHERE name = 'Xiaomi TV Stick 4K (2nd Gen)'
ON CONFLICT (device_id) DO UPDATE SET price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency, availability = EXCLUDED.availability, source_url = EXCLUDED.source_url, scraped_at = EXCLUDED.scraped_at;

INSERT INTO public.streaming_device_prices (device_id, price_cents, currency, availability, source_url, scraped_at)
SELECT id, 5400, 'GBP', 'Temporarily out of stock', 'https://www.amazon.co.uk/Xiaomi-TV-Box-3rd-Gen-black/dp/B0F3JWFL56', now()
FROM public.streaming_devices WHERE name = 'Xiaomi TV Box S (3rd Gen)'
ON CONFLICT (device_id) DO UPDATE SET price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency, availability = EXCLUDED.availability, source_url = EXCLUDED.source_url, scraped_at = EXCLUDED.scraped_at;