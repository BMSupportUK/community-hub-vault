CREATE TABLE public.player_2fa_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offsite_customer_id uuid NOT NULL,
  device_id uuid,
  token_hash text NOT NULL UNIQUE,
  code text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','code_issued','reset','done','expired')),
  number_failures int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  closed_at timestamptz
);
CREATE INDEX player_2fa_resets_customer_idx ON public.player_2fa_resets(offsite_customer_id);
GRANT ALL ON public.player_2fa_resets TO service_role;
ALTER TABLE public.player_2fa_resets ENABLE ROW LEVEL SECURITY;