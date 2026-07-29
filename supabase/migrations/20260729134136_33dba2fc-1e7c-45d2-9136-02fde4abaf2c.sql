ALTER TABLE public.sports_blogs
  ADD COLUMN IF NOT EXISTS archived_body text,
  ADD COLUMN IF NOT EXISTS archived_excerpt text;

CREATE OR REPLACE FUNCTION public.sports_blogs_clear_expired()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('sports_blogs.skip_auto', 'on', true);
  UPDATE public.sports_blogs
     SET archived_body = COALESCE(body, archived_body),
         archived_excerpt = COALESCE(excerpt, archived_excerpt),
         excerpt = NULL,
         body = NULL
   WHERE auto_clear_at IS NOT NULL
     AND auto_clear_at <= now()
     AND (excerpt IS NOT NULL OR body IS NOT NULL);
  PERFORM set_config('sports_blogs.skip_auto', 'off', true);
END;
$function$;