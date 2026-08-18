select vault.create_secret('#qNxB@RxE7aZ&9SHYkE!%RJIuYNMLOjW', 'CRON_SECRET', 'Shared secret for /api/public/hooks/* endpoints');

CREATE OR REPLACE FUNCTION public.notify_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_kind text := TG_ARGV[0];
  v_id text;
  v_url text := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/notify';
  v_secret text;
  v_row jsonb;
BEGIN
  IF v_kind = 'order' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
      IF NEW.status::text NOT IN ('processing','paid','completed') THEN RETURN NEW; END IF;
    END IF;
  END IF;

  v_row := to_jsonb(NEW);
  v_id := COALESCE(v_row->>'id', v_row->>'user_id');
  IF v_id IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object('kind', v_kind, 'id', v_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_user_notification_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/user-notification-push';
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object('id', NEW.id::text)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

select cron.alter_job(9, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/scheduled-reminders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"#qNxB@RxE7aZ&9SHYkE!%RJIuYNMLOjW"}'::jsonb,
    body := '{}'::jsonb
  );
$cmd$);

select cron.alter_job(14, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/refresh-streaming-prices',
    headers := '{"Content-Type":"application/json","x-cron-secret":"#qNxB@RxE7aZ&9SHYkE!%RJIuYNMLOjW"}'::jsonb,
    body := '{}'::jsonb
  );
$cmd$);

select cron.alter_job(23, command := $cmd$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/boro-fetch-fixtures',
    headers := '{"Content-Type":"application/json","x-cron-secret":"#qNxB@RxE7aZ&9SHYkE!%RJIuYNMLOjW"}'::jsonb,
    body := '{}'::jsonb
  );
$cmd$);
