ALTER TABLE public.prediction_winners
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.prediction_winners
  DROP CONSTRAINT IF EXISTS prediction_winners_user_id_fkey;

ALTER TABLE public.prediction_winners
  DROP CONSTRAINT IF EXISTS prediction_winners_competition_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS prediction_winners_competition_user_guest_key
  ON public.prediction_winners (competition, user_id, is_guest);