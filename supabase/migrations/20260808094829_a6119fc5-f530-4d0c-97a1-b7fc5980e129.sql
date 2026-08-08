ALTER TABLE public.fantasy_players
  ADD COLUMN IF NOT EXISTS mfc_player_id TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_players_mfc_player_id_key
  ON public.fantasy_players (mfc_player_id) WHERE mfc_player_id IS NOT NULL;