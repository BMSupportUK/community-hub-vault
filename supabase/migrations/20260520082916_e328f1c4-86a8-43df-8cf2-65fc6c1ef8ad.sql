-- Extensions for HTTP from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- notification_settings (single-row config)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id boolean PRIMARY KEY DEFAULT true,
  telegram_chat_id text,
  whatsapp_from text,
  whatsapp_to text,
  notify_signups boolean NOT NULL DEFAULT true,
  notify_tickets boolean NOT NULL DEFAULT true,
  notify_orders boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_singleton CHECK (id = true)
);

INSERT INTO public.notification_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_settings admin read"
  ON public.notification_settings FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role,'management'::public.app_role]));

CREATE POLICY "notif_settings admin update"
  ON public.notification_settings FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role,'management'::public.app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role,'management'::public.app_role]));

-- ============================================================
-- notification_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                 -- 'signup' | 'ticket' | 'order'
  channel text NOT NULL,              -- 'telegram' | 'whatsapp'
  target_id text,                     -- source row id (uuid as text)
  status text NOT NULL,               -- 'sent' | 'failed' | 'skipped'
  message text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_created_at
  ON public.notification_log (created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_log admin read"
  ON public.notification_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role,'management'::public.app_role]));

-- ============================================================
-- Trigger function: POST to /api/public/hooks/notify
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_id text;
  v_url text := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/notify';
  v_anon text;
BEGIN
  -- For order paid notifications, only fire on transition into 'paid'/'processing'/'completed'
  IF v_kind = 'order' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
      IF NEW.status::text NOT IN ('processing','paid','completed') THEN RETURN NEW; END IF;
    END IF;
  END IF;

  v_id := COALESCE(NEW.id::text, NEW.user_id::text);

  -- anon key for /api/public/* auth
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
  -- never block the originating insert
  RETURN NEW;
END;
$$;

-- ============================================================
-- Attach triggers
-- ============================================================
DROP TRIGGER IF EXISTS trg_notify_signup ON public.signup_info;
CREATE TRIGGER trg_notify_signup
AFTER INSERT ON public.signup_info
FOR EACH ROW EXECUTE FUNCTION public.notify_event('signup');

DROP TRIGGER IF EXISTS trg_notify_ticket ON public.tickets;
CREATE TRIGGER trg_notify_ticket
AFTER INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_event('ticket');

DROP TRIGGER IF EXISTS trg_notify_order_ins ON private.orders;
CREATE TRIGGER trg_notify_order_ins
AFTER INSERT ON private.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_event('order');

DROP TRIGGER IF EXISTS trg_notify_order_upd ON private.orders;
CREATE TRIGGER trg_notify_order_upd
AFTER UPDATE OF status ON private.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_event('order');