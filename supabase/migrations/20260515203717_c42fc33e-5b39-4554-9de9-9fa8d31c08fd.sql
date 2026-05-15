CREATE OR REPLACE FUNCTION public.enforce_slow_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secs integer;
  v_last timestamptz;
BEGIN
  SELECT slow_mode_seconds INTO v_secs FROM public.chat_channels WHERE id = NEW.channel_id;
  IF v_secs IS NULL OR v_secs <= 0 THEN RETURN NEW; END IF;
  IF public.has_any_role(NEW.sender_id, ARRAY['admin','management','moderator','staff']::app_role[]) THEN
    RETURN NEW;
  END IF;
  SELECT MAX(created_at) INTO v_last
  FROM public.chat_messages
  WHERE channel_id = NEW.channel_id AND sender_id = NEW.sender_id;
  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => v_secs) THEN
    RAISE EXCEPTION 'Slow mode is on. Please wait % seconds between messages.', v_secs;
  END IF;
  RETURN NEW;
END $function$;