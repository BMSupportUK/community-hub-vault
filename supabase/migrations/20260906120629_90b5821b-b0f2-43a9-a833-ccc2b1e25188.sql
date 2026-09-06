CREATE TABLE public.fan_zone_mod_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('mute','unmute','ban','unban')),
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fan_zone_mod_actions_created_idx ON public.fan_zone_mod_actions (created_at DESC);
CREATE INDEX fan_zone_mod_actions_user_idx ON public.fan_zone_mod_actions (user_id);

GRANT SELECT ON public.fan_zone_mod_actions TO authenticated;
GRANT ALL ON public.fan_zone_mod_actions TO service_role;

ALTER TABLE public.fan_zone_mod_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fan Zone staff can read the moderation log"
ON public.fan_zone_mod_actions FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]));

CREATE OR REPLACE FUNCTION public.fan_zone_ban(_user_id uuid, _minutes integer, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _expires timestamptz;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Only Boro Fan Zone staff can ban members';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot ban yourself';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = ANY (ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[])
  ) THEN
    RAISE EXCEPTION 'Boro Fan Zone staff cannot be banned';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF _minutes IS NOT NULL AND (_minutes < 1 OR _minutes > 525600) THEN
    RAISE EXCEPTION 'Ban length must be between 1 minute and 1 year';
  END IF;

  DELETE FROM public.fan_zone_bans
  WHERE user_id = _user_id AND (expires_at IS NULL OR expires_at > now());

  _expires := CASE WHEN _minutes IS NULL THEN NULL ELSE now() + make_interval(mins => _minutes) END;

  INSERT INTO public.fan_zone_bans (user_id, banned_by, reason, expires_at)
  VALUES (_user_id, auth.uid(), left(btrim(_reason), 1000), _expires)
  RETURNING id INTO _new_id;

  INSERT INTO public.fan_zone_mod_actions (user_id, actor_id, action, reason, expires_at)
  VALUES (_user_id, auth.uid(), 'ban', left(btrim(_reason), 1000), _expires);

  RETURN _new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fan_zone_unban(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _reason text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]) THEN
    RAISE EXCEPTION 'Only Boro Fan Zone staff can lift a ban';
  END IF;

  SELECT reason INTO _reason FROM public.fan_zone_bans
  WHERE user_id = _user_id AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC LIMIT 1;

  DELETE FROM public.fan_zone_bans
  WHERE user_id = _user_id AND (expires_at IS NULL OR expires_at > now());

  INSERT INTO public.fan_zone_mod_actions (user_id, actor_id, action, reason)
  VALUES (_user_id, auth.uid(), 'unban', _reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fan_zone_mute(_user_id uuid, _minutes integer, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _expires timestamptz;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]) THEN
    RAISE EXCEPTION 'Only moderators can mute members';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot mute yourself';
  END IF;
  IF has_any_role(_user_id, ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]) THEN
    RAISE EXCEPTION 'Moderators and admins cannot be muted';
  END IF;
  IF COALESCE(_minutes, 0) < 1 OR _minutes > 525600 THEN
    RAISE EXCEPTION 'Mute length must be between 1 minute and 1 year';
  END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  DELETE FROM public.fan_zone_mutes WHERE user_id = _user_id AND expires_at > now();

  _expires := now() + make_interval(mins => _minutes);

  INSERT INTO public.fan_zone_mutes (user_id, muted_by, reason, expires_at)
  VALUES (_user_id, auth.uid(), btrim(left(_reason, 1000)), _expires)
  RETURNING id INTO _id;

  INSERT INTO public.fan_zone_mod_actions (user_id, actor_id, action, reason, expires_at)
  VALUES (_user_id, auth.uid(), 'mute', btrim(left(_reason, 1000)), _expires);

  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fan_zone_unmute(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _reason text;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'boro_fan_zone_moderator'::app_role]) THEN
    RAISE EXCEPTION 'Only moderators can unmute members';
  END IF;

  SELECT reason INTO _reason FROM public.fan_zone_mutes
  WHERE user_id = _user_id AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  DELETE FROM public.fan_zone_mutes WHERE user_id = _user_id AND expires_at > now();

  INSERT INTO public.fan_zone_mod_actions (user_id, actor_id, action, reason)
  VALUES (_user_id, auth.uid(), 'unmute', _reason);
END;
$function$;