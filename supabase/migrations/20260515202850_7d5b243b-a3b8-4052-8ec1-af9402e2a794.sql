
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS slow_mode_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_slow_mode_seconds_chk
  CHECK (slow_mode_seconds >= 0 AND slow_mode_seconds <= 21600);

CREATE OR REPLACE FUNCTION public.enforce_slow_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secs integer;
  v_last timestamptz;
BEGIN
  SELECT slow_mode_seconds INTO v_secs FROM public.chat_channels WHERE id = NEW.channel_id;
  IF v_secs IS NULL OR v_secs <= 0 THEN RETURN NEW; END IF;
  IF public.has_any_role(NEW.sender_id, ARRAY['admin','management','moderator']::app_role[]) THEN
    RETURN NEW;
  END IF;
  SELECT MAX(created_at) INTO v_last
  FROM public.chat_messages
  WHERE channel_id = NEW.channel_id AND sender_id = NEW.sender_id;
  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => v_secs) THEN
    RAISE EXCEPTION 'Slow mode is on. Please wait % seconds between messages.', v_secs;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chat_messages_slow_mode ON public.chat_messages;
CREATE TRIGGER chat_messages_slow_mode
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_slow_mode();
