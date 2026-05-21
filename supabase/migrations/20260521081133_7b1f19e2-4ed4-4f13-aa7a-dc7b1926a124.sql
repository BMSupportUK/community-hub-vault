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
  v_anon text;
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

  SELECT decrypted_secret INTO v_anon
    FROM vault.decrypted_secrets WHERE name='SUPABASE_ANON_KEY' LIMIT 1;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', COALESCE(v_anon, '')
    ),
    body := jsonb_build_object('kind', v_kind, 'id', v_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;