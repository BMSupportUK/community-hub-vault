ALTER TABLE public.player_devices ADD COLUMN IF NOT EXISTS unlock_lock_level integer NOT NULL DEFAULT 0;
ALTER TABLE public.player_pending_credentials ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false;

CREATE TABLE public.player_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('box_limit','unusual_place','lockout','new_box','removed_not_me')),
  device_id uuid,
  owner_id uuid,
  login text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','refused','closed')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.player_security_events TO authenticated;
GRANT ALL ON public.player_security_events TO service_role;
ALTER TABLE public.player_security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player security admin read" ON public.player_security_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "player security admin update" ON public.player_security_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE INDEX player_security_events_open ON public.player_security_events (status, created_at DESC);