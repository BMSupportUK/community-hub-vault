CREATE TABLE public.player_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  offsite_customer_id uuid,
  code text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_backup_codes_one_owner CHECK ((owner_id IS NULL) <> (offsite_customer_id IS NULL))
);
CREATE INDEX player_backup_codes_owner_idx ON public.player_backup_codes(owner_id);
CREATE INDEX player_backup_codes_offsite_idx ON public.player_backup_codes(offsite_customer_id);
GRANT ALL ON public.player_backup_codes TO service_role;
ALTER TABLE public.player_backup_codes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.player_pins IS 'DEPRECATED: BM Player PIN removed; authenticator codes and player_backup_codes replace it';