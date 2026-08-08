ALTER TABLE public.fantasy_players ADD COLUMN IF NOT EXISTS squad_level text NOT NULL DEFAULT 'first';
UPDATE public.fantasy_players SET mfc_player_id = NULL WHERE mfc_player_id = '';
-- restore everyone wiped by the failed 10:40 academy sync
UPDATE public.fantasy_players SET status = 'active', departed_at = NULL WHERE departed_at >= '2026-08-08 10:30:00+00';
UPDATE public.fantasy_players SET squad_level = CASE WHEN value_m <= 2.5 THEN 'u21' ELSE 'first' END WHERE status = 'active';