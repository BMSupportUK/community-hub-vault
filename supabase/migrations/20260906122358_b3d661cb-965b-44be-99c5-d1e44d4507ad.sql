ALTER TABLE public.fan_zone_mod_actions DROP CONSTRAINT IF EXISTS fan_zone_mod_actions_action_check;

ALTER TABLE public.fan_zone_mod_actions
  ADD CONSTRAINT fan_zone_mod_actions_action_check
  CHECK (action IN ('mute','unmute','ban','unban','appeal','appeal_reply'));

CREATE OR REPLACE FUNCTION public.fan_zone_appeal_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.fan_zone_appeals WHERE id = NEW.appeal_id;

  INSERT INTO public.fan_zone_mod_actions (user_id, actor_id, action, reason, expires_at)
  VALUES (
    v_user,
    NEW.author_id,
    CASE WHEN NEW.from_staff THEN 'appeal_reply' ELSE 'appeal' END,
    left(NEW.body, 300),
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fan_zone_appeal_messages_log ON public.fan_zone_appeal_messages;

CREATE TRIGGER fan_zone_appeal_messages_log
AFTER INSERT ON public.fan_zone_appeal_messages
FOR EACH ROW EXECUTE FUNCTION public.fan_zone_appeal_log();