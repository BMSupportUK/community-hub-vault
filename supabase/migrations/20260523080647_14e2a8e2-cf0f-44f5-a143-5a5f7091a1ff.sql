CREATE OR REPLACE FUNCTION public.sports_blogs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('sports_blogs.skip_auto', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Only bump updated_at when meaningful content actually changed.
  -- Reordering (sort_order) or auto-clear bookkeeping should NOT mark
  -- the guide as freshly edited / unread.
  IF TG_OP = 'UPDATE' AND
     NEW.title IS NOT DISTINCT FROM OLD.title AND
     NEW.body IS NOT DISTINCT FROM OLD.body AND
     NEW.excerpt IS NOT DISTINCT FROM OLD.excerpt AND
     NEW.image_url IS NOT DISTINCT FROM OLD.image_url AND
     NEW.badge IS NOT DISTINCT FROM OLD.badge AND
     NEW.refresh_notice IS NOT DISTINCT FROM OLD.refresh_notice AND
     NEW.category_id IS NOT DISTINCT FROM OLD.category_id AND
     NEW.published IS NOT DISTINCT FROM OLD.published
  THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;