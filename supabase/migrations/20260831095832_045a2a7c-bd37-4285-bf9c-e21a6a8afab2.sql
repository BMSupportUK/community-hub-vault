CREATE TABLE public.bank_transfer_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  account_name text NOT NULL DEFAULT '',
  sort_code text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  iban text,
  bic text,
  reference_prefix text NOT NULL DEFAULT 'BM',
  instructions text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bank_transfer_details TO service_role;
ALTER TABLE public.bank_transfer_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view bank details" ON public.bank_transfer_details
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.bank_transfer_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  granted_by uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT ON public.bank_transfer_permissions TO authenticated;
GRANT ALL ON public.bank_transfer_permissions TO service_role;
ALTER TABLE public.bank_transfer_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own bank transfer permission" ON public.bank_transfer_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owners can view all bank transfer permissions" ON public.bank_transfer_permissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.can_pay_by_bank_transfer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bank_transfer_permissions p
    WHERE p.user_id = _user_id
      AND p.revoked_at IS NULL
      AND (p.expires_at IS NULL OR p.expires_at > now())
  )
$$;

CREATE TRIGGER bank_transfer_details_updated_at
  BEFORE UPDATE ON public.bank_transfer_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bank_transfer_permissions_updated_at
  BEFORE UPDATE ON public.bank_transfer_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.bank_transfer_details (singleton) VALUES (true) ON CONFLICT DO NOTHING;