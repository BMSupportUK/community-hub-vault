CREATE TABLE public.player_fault_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  app_version text NOT NULL DEFAULT '',
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_fault_notes TO service_role;
ALTER TABLE public.player_fault_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX player_fault_notes_device_idx ON public.player_fault_notes (device_id, created_at DESC);