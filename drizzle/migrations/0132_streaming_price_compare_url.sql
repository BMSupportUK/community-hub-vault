ALTER TABLE public.streaming_devices ADD COLUMN IF NOT EXISTS price_compare_url text;
ALTER TABLE public.streaming_device_prices ADD COLUMN IF NOT EXISTS shop_name text;
UPDATE public.streaming_devices SET price_compare_url='https://pricespy.co.uk/product.php?p=15875429' WHERE id='56dd2c60-91d7-4e7c-aa00-6af34a81b29a';
UPDATE public.streaming_devices SET price_compare_url='https://pricespy.co.uk/product.php?p=7900139' WHERE id='ee6f01d9-76be-418b-81e4-3dc1a672de0a';
UPDATE public.streaming_devices SET price_compare_url='https://pricespy.co.uk/product.php?p=16714691' WHERE id='d458c173-fdf4-469b-bc9e-f8772824788b';
UPDATE public.streaming_devices SET price_compare_url='https://pricespy.co.uk/product.php?p=14551443' WHERE id='401d164a-4796-4236-a29a-ac9556a70eff';