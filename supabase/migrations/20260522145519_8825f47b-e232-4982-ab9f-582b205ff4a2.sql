CREATE OR REPLACE FUNCTION public.notify_user_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/user-notification-push';
  v_anon text;
BEGIN
  SELECT decrypted_secret INTO v_anon
    FROM vault.decrypted_secrets WHERE name='SUPABASE_ANON_KEY' LIMIT 1;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', COALESCE(v_anon, '')
    ),
    body := jsonb_build_object('id', NEW.id::text)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_notifications_push_after_insert ON public.user_notifications;
CREATE TRIGGER user_notifications_push_after_insert
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_notification_push();