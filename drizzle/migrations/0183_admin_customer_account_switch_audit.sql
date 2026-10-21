CREATE TABLE public.admin_customer_account_switches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 return_token_hash text NOT NULL UNIQUE,
 started_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
 returned_at timestamptz
);
GRANT SELECT ON public.admin_customer_account_switches TO authenticated;
GRANT ALL ON public.admin_customer_account_switches TO service_role;
ALTER TABLE public.admin_customer_account_switches ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_account_switch_audit ON public.admin_customer_account_switches FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX admin_customer_account_switches_admin_time ON public.admin_customer_account_switches(admin_id,started_at DESC);