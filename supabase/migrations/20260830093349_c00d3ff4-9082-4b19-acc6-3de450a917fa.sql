CREATE TABLE public.screen_lock_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  timeout_minutes integer NOT NULL DEFAULT 15,
  code_hash text,
  must_change boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.screen_lock_settings TO authenticated;
GRANT ALL ON public.screen_lock_settings TO service_role;

ALTER TABLE public.screen_lock_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own screen lock settings"
ON public.screen_lock_settings FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view screen lock settings"
ON public.screen_lock_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE TRIGGER update_screen_lock_settings_updated_at
BEFORE UPDATE ON public.screen_lock_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.screen_lock_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX screen_lock_reset_requests_status_idx ON public.screen_lock_reset_requests (status, requested_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.screen_lock_reset_requests TO authenticated;
GRANT ALL ON public.screen_lock_reset_requests TO service_role;

ALTER TABLE public.screen_lock_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own lock reset requests"
ON public.screen_lock_reset_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own lock reset requests"
ON public.screen_lock_reset_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE POLICY "Admins update lock reset requests"
ON public.screen_lock_reset_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE TRIGGER update_screen_lock_reset_requests_updated_at
BEFORE UPDATE ON public.screen_lock_reset_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.screen_lock_reset_requests;