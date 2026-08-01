CREATE OR REPLACE FUNCTION public.sports_blogs_clear_expired()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Guide bodies are permanent editorial content. Expired event visibility is
  -- handled per event by the application; never erase the complete guide.
  RETURN;
END;
$function$;

UPDATE public.sports_blogs
SET auto_clear_at = NULL
WHERE auto_clear_at IS NOT NULL;