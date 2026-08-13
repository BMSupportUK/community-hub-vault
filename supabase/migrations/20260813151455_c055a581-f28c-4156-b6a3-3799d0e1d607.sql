UPDATE public.streaming_device_prices AS p
SET availability = 'In stock', scraped_at = now()
FROM public.streaming_devices AS d
WHERE p.device_id = d.id
  AND d.is_active = true
  AND d.amazon_url ILIKE '%world-of-satellite.co.uk%';

UPDATE public.streaming_device_prices AS p
SET availability = 'Out of stock', scraped_at = now()
FROM public.streaming_devices AS d
WHERE p.device_id = d.id
  AND d.is_active = true
  AND d.name = 'Xiaomi TV Box S (3rd Gen)';