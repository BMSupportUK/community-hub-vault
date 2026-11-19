CREATE TABLE public.order_provisioning (
  order_id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('create','renew')),
  status text NOT NULL DEFAULT 'working' CHECK (status IN ('working','submitted','done','failed')),
  panel_username text,
  panel_password text,
  panel_line_id text,
  exp_date text,
  package_id text,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.order_provisioning TO service_role;
ALTER TABLE public.order_provisioning ENABLE ROW LEVEL SECURITY;