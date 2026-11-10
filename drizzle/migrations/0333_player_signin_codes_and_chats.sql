CREATE TABLE public.player_signin_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_signin_codes TO service_role;
ALTER TABLE public.player_signin_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.player_signin_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open',
  offsite_customer_id uuid,
  code text,
  code_expires_at timestamptz,
  failures int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX player_signin_chats_device_idx ON public.player_signin_chats(device_id, status);
GRANT ALL ON public.player_signin_chats TO service_role;
ALTER TABLE public.player_signin_chats ENABLE ROW LEVEL SECURITY;