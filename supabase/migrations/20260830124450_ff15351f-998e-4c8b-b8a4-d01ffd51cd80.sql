ALTER TABLE public.chat_channels ALTER COLUMN slow_mode_seconds SET DEFAULT 0;
UPDATE public.chat_channels SET slow_mode_seconds = 0 WHERE slow_mode_seconds > 0;