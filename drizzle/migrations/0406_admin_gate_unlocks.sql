CREATE TABLE public.admin_gate_unlocks (
  user_id uuid NOT NULL,
  gate text NOT NULL,
  unlocked_until timestamptz NOT NULL,
  PRIMARY KEY (user_id, gate)
);
GRANT ALL ON public.admin_gate_unlocks TO service_role;
ALTER TABLE public.admin_gate_unlocks ENABLE ROW LEVEL SECURITY;