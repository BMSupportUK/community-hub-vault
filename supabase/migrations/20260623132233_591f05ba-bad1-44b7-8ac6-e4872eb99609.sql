CREATE OR REPLACE FUNCTION public.notify_status_incident_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/status-incident-push';
  v_anon text;
  v_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_kind := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Fire only when an incident transitions to 'completed'.
    IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' THEN
      v_kind := 'resolved';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_anon
    FROM vault.decrypted_secrets WHERE name='SUPABASE_ANON_KEY' LIMIT 1;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', COALESCE(v_anon, '')
    ),
    body := jsonb_build_object('id', NEW.id::text, 'kind', v_kind)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS status_incidents_push_after_insert ON public.status_incidents;
CREATE TRIGGER status_incidents_push_after_insert
  AFTER INSERT ON public.status_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_status_incident_push();

DROP TRIGGER IF EXISTS status_incidents_push_after_update ON public.status_incidents;
CREATE TRIGGER status_incidents_push_after_update
  AFTER UPDATE ON public.status_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_status_incident_push();