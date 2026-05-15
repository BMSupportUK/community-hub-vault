ALTER TABLE public.chat_channels ALTER COLUMN slow_mode_seconds SET DEFAULT 30;
UPDATE public.chat_channels SET slow_mode_seconds = 30 WHERE slow_mode_seconds IS NULL OR slow_mode_seconds = 0;