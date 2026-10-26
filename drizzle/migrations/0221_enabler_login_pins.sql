CREATE TABLE public.enabler_login_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid,
  order_id uuid,
  pin_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX enabler_login_pins_ticket_idx ON public.enabler_login_pins(ticket_id);
CREATE INDEX enabler_login_pins_order_idx ON public.enabler_login_pins(order_id);
GRANT ALL ON public.enabler_login_pins TO service_role;
ALTER TABLE public.enabler_login_pins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.enabler_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id uuid NOT NULL REFERENCES public.enabler_login_pins(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.enabler_device_tokens TO service_role;
ALTER TABLE public.enabler_device_tokens ENABLE ROW LEVEL SECURITY;