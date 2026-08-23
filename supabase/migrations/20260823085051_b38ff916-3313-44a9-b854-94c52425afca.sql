CREATE OR REPLACE FUNCTION public.validate_mention_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.content ~* '(^|\s)@(all|here)\b') THEN
    IF NOT (
      public.has_any_role(NEW.sender_id, ARRAY['admin','management']::app_role[])
      OR public.can_in_channel(NEW.sender_id, NEW.channel_id, 'mention')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to use @all or @here in this channel';
    END IF;
  END IF;

  -- Only staff roles may tag @admin. Everyone else can tag @management, @moderator, @staff.
  IF (NEW.content ~* '(^|\s)@admin\b') THEN
    IF NOT public.has_any_role(NEW.sender_id, ARRAY['admin','management','moderator','staff']::app_role[]) THEN
      RAISE EXCEPTION 'Only staff can mention @admin. Use @management, @moderator or @staff instead.';
    END IF;
  END IF;

  RETURN NEW;
END $function$;