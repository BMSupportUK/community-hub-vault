
-- Guest entrants for World Cup predictor (email + PIN, no Supabase auth)
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.wc_guest_entrants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  pin_salt text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wc_guest_entrants TO authenticated;
GRANT ALL ON public.wc_guest_entrants TO service_role;

ALTER TABLE public.wc_guest_entrants ENABLE ROW LEVEL SECURITY;

-- Block all direct client access; PIN verification & writes go through server functions (service role)
CREATE POLICY "wc_guest_entrants_no_direct_select" ON public.wc_guest_entrants
  FOR SELECT TO authenticated USING (false);

-- Add guest_id to wc_predictions so the same scoring + storage works for guests
ALTER TABLE public.wc_predictions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.wc_predictions
  ADD COLUMN guest_id uuid REFERENCES public.wc_guest_entrants(id) ON DELETE CASCADE;

ALTER TABLE public.wc_predictions
  ADD CONSTRAINT wc_predictions_one_entrant
    CHECK ((user_id IS NULL) <> (guest_id IS NULL));

CREATE UNIQUE INDEX wc_predictions_guest_fixture_unique
  ON public.wc_predictions (guest_id, fixture_id)
  WHERE guest_id IS NOT NULL;

CREATE INDEX wc_predictions_guest_id_idx ON public.wc_predictions (guest_id);

-- Allow anonymous (logged-out) visitors to read fixtures, so server fns can stream them
GRANT SELECT ON public.wc_fixtures TO anon;

-- Rebuild leaderboard view to merge signed-in users and guest entrants
DROP VIEW IF EXISTS public.wc_leaderboard;

CREATE VIEW public.wc_leaderboard AS
SELECT
  COALESCE(p.user_id, p.guest_id) AS user_id,
  COALESCE(pr.display_name, ge.display_name) AS display_name,
  pr.username,
  pr.avatar_url,
  (p.guest_id IS NOT NULL) AS is_guest,
  (COALESCE(sum(p.points), 0))::integer AS total_points,
  (count(*) FILTER (WHERE p.points = 5))::integer AS exact_count,
  (count(*) FILTER (WHERE p.points = ANY (ARRAY[1, 3])))::integer AS result_count,
  (count(*))::integer AS predictions_made,
  (count(*) FILTER (WHERE p.points IS NOT NULL))::integer AS predictions_scored
FROM public.wc_predictions p
LEFT JOIN public.profiles pr ON pr.id = p.user_id
LEFT JOIN public.wc_guest_entrants ge ON ge.id = p.guest_id
GROUP BY
  COALESCE(p.user_id, p.guest_id),
  pr.display_name, ge.display_name,
  pr.username, pr.avatar_url,
  (p.guest_id IS NOT NULL);

GRANT SELECT ON public.wc_leaderboard TO anon, authenticated;

-- Updated-at trigger for guest entrants
CREATE OR REPLACE FUNCTION public.tg_wc_guest_entrants_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wc_guest_entrants_touch
BEFORE UPDATE ON public.wc_guest_entrants
FOR EACH ROW EXECUTE FUNCTION public.tg_wc_guest_entrants_touch_updated_at();
