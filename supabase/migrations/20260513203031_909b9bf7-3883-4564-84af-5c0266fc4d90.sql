
-- Per-user vault PIN (hashed)
CREATE TABLE public.vault_pins (
  user_id uuid PRIMARY KEY,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vault_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_pins owner read" ON public.vault_pins FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "vault_pins owner insert" ON public.vault_pins FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "vault_pins owner update" ON public.vault_pins FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER vault_pins_updated_at BEFORE UPDATE ON public.vault_pins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- App credentials
CREATE TABLE public.app_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  app_login_name text NOT NULL,
  password text NOT NULL,
  expiry_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX app_credentials_owner_idx ON public.app_credentials(owner_id);

CREATE POLICY "app_credentials read owner or admin" ON public.app_credentials FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));
CREATE POLICY "app_credentials manage admin" ON public.app_credentials FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER app_credentials_updated_at BEFORE UPDATE ON public.app_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- QD DNS codes
CREATE TABLE public.qd_dns_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  code text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qd_dns_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qd_dns read approved" ON public.qd_dns_codes FOR SELECT TO authenticated
  USING (NOT has_role(auth.uid(), 'pending'::app_role) AND NOT has_role(auth.uid(), 'banned'::app_role));
CREATE POLICY "qd_dns manage admin" ON public.qd_dns_codes FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER qd_dns_codes_updated_at BEFORE UPDATE ON public.qd_dns_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
