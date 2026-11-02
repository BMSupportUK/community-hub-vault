CREATE TABLE public.player_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dns text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.player_settings TO authenticated;
GRANT ALL ON public.player_settings TO service_role;
ALTER TABLE public.player_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read player settings" ON public.player_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert player settings" ON public.player_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update player settings" ON public.player_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.player_settings (id, dns) VALUES (1, '') ON CONFLICT DO NOTHING;

CREATE TABLE public.player_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  token_hash text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  name text NOT NULL DEFAULT 'BM Player',
  created_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX player_devices_user_idx ON public.player_devices (user_id);
GRANT SELECT, DELETE ON public.player_devices TO authenticated;
GRANT ALL ON public.player_devices TO service_role;
ALTER TABLE public.player_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their player devices" ON public.player_devices FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners remove their player devices" ON public.player_devices FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.player_link_codes (
  code_hash text PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES public.player_devices(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_link_codes TO service_role;
ALTER TABLE public.player_link_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.player_pending_credentials (
  device_id uuid PRIMARY KEY REFERENCES public.player_devices(id) ON DELETE CASCADE,
  username text NOT NULL,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_pending_credentials TO service_role;
ALTER TABLE public.player_pending_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.player_link_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX player_link_attempts_user_idx ON public.player_link_attempts (user_id, created_at);
GRANT ALL ON public.player_link_attempts TO service_role;
ALTER TABLE public.player_link_attempts ENABLE ROW LEVEL SECURITY;