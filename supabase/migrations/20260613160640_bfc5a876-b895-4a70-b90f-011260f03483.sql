
CREATE TABLE public.boro_fixtures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition  text NOT NULL DEFAULT 'Championship',
  home_team    text NOT NULL,
  away_team    text NOT NULL,
  kickoff_at   timestamptz NOT NULL,
  venue        text,
  home_score   integer,
  away_score   integer,
  status       text NOT NULL DEFAULT 'SCHEDULED',
  minute       integer,
  minute_added integer,
  month_key    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boro_fixtures_score_chk CHECK (
    (home_score IS NULL AND away_score IS NULL) OR
    (home_score >= 0 AND home_score <= 99 AND away_score >= 0 AND away_score <= 99)
  )
);
GRANT SELECT ON public.boro_fixtures TO anon, authenticated;
GRANT ALL ON public.boro_fixtures TO service_role;
ALTER TABLE public.boro_fixtures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boro_fixtures_select_all" ON public.boro_fixtures FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "boro_fixtures_admin_insert" ON public.boro_fixtures FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management'));
CREATE POLICY "boro_fixtures_admin_update" ON public.boro_fixtures FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management'));
CREATE POLICY "boro_fixtures_admin_delete" ON public.boro_fixtures FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management'));

CREATE INDEX boro_fixtures_kickoff_idx ON public.boro_fixtures (kickoff_at);
CREATE INDEX boro_fixtures_month_idx ON public.boro_fixtures (month_key);

CREATE OR REPLACE FUNCTION public.tg_boro_fixtures_month_key()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.month_key := to_char((NEW.kickoff_at AT TIME ZONE 'Europe/London'), 'YYYY-MM');
  RETURN NEW;
END;
$$;
CREATE TRIGGER boro_fixtures_month_key_trg
  BEFORE INSERT OR UPDATE OF kickoff_at ON public.boro_fixtures
  FOR EACH ROW EXECUTE FUNCTION public.tg_boro_fixtures_month_key();

-- boro_entrants
CREATE TABLE public.boro_entrants (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.boro_entrants TO authenticated;
GRANT ALL ON public.boro_entrants TO service_role;
ALTER TABLE public.boro_entrants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boro_entrants_insert_self" ON public.boro_entrants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "boro_entrants_delete_self" ON public.boro_entrants FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "boro_entrants_select_own" ON public.boro_entrants FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "boro_entrants_select_admin" ON public.boro_entrants FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management'));

-- boro_guest_entrants
CREATE TABLE public.boro_guest_entrants (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                citext NOT NULL UNIQUE,
  display_name         text NOT NULL,
  pin_salt             text NOT NULL,
  pin_hash             text NOT NULL,
  pin_reset_hash       text,
  pin_reset_expires_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.boro_guest_entrants TO service_role;
ALTER TABLE public.boro_guest_entrants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boro_guest_entrants_no_direct_select" ON public.boro_guest_entrants FOR SELECT TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.tg_boro_guest_entrants_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_boro_guest_entrants_touch
  BEFORE UPDATE ON public.boro_guest_entrants
  FOR EACH ROW EXECUTE FUNCTION public.tg_boro_guest_entrants_touch_updated_at();

-- boro_predictions
CREATE TABLE public.boro_predictions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id   uuid REFERENCES public.boro_guest_entrants(id) ON DELETE CASCADE,
  fixture_id uuid NOT NULL REFERENCES public.boro_fixtures(id) ON DELETE CASCADE,
  home_pred  integer NOT NULL CHECK (home_pred >= 0 AND home_pred <= 30),
  away_pred  integer NOT NULL CHECK (away_pred >= 0 AND away_pred <= 30),
  points     integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boro_predictions_one_entrant CHECK ((user_id IS NULL) <> (guest_id IS NULL)),
  CONSTRAINT boro_predictions_user_fixture_unique UNIQUE (user_id, fixture_id),
  CONSTRAINT boro_predictions_guest_fixture_unique UNIQUE (guest_id, fixture_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boro_predictions TO authenticated;
GRANT ALL ON public.boro_predictions TO service_role;
ALTER TABLE public.boro_predictions ENABLE ROW LEVEL SECURITY;

CREATE INDEX boro_predictions_user_idx    ON public.boro_predictions (user_id);
CREATE INDEX boro_predictions_guest_idx   ON public.boro_predictions (guest_id);
CREATE INDEX boro_predictions_fixture_idx ON public.boro_predictions (fixture_id);

CREATE POLICY "boro_predictions_select_own" ON public.boro_predictions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "boro_predictions_select_admin" ON public.boro_predictions FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management'));
CREATE POLICY "boro_predictions_insert_own" ON public.boro_predictions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.boro_entrants e WHERE e.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.boro_fixtures f
                 WHERE f.id = fixture_id AND f.kickoff_at > now() + interval '30 minutes')
  );
CREATE POLICY "boro_predictions_update_own" ON public.boro_predictions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.boro_fixtures f
                 WHERE f.id = fixture_id AND f.kickoff_at > now() + interval '30 minutes')
  );
CREATE POLICY "boro_predictions_delete_own" ON public.boro_predictions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER boro_fixtures_set_updated_at BEFORE UPDATE ON public.boro_fixtures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER boro_predictions_set_updated_at BEFORE UPDATE ON public.boro_predictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- scoring
CREATE OR REPLACE FUNCTION public.boro_score_fixture(_fixture_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hs int; as_ int;
BEGIN
  SELECT home_score, away_score INTO hs, as_ FROM public.boro_fixtures WHERE id = _fixture_id;
  IF hs IS NULL OR as_ IS NULL THEN RETURN; END IF;
  UPDATE public.boro_predictions
     SET points = public.wc_calc_points(home_pred, away_pred, hs, as_),
         updated_at = now()
   WHERE fixture_id = _fixture_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_boro_score_on_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'FINISHED'
     AND NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.home_score IS DISTINCT FROM NEW.home_score
          OR OLD.away_score IS DISTINCT FROM NEW.away_score) THEN
    PERFORM public.boro_score_fixture(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER boro_score_on_finish_trg AFTER UPDATE ON public.boro_fixtures
  FOR EACH ROW EXECUTE FUNCTION public.tg_boro_score_on_finish();

-- leaderboard view
CREATE OR REPLACE VIEW public.boro_leaderboard
WITH (security_invoker = true) AS
SELECT
  COALESCE(p.user_id, p.guest_id)                    AS user_id,
  COALESCE(pr.display_name, ge.display_name)         AS display_name,
  pr.username,
  pr.avatar_url,
  p.guest_id IS NOT NULL                             AS is_guest,
  COALESCE(SUM(p.points), 0)::int                    AS total_points,
  COUNT(*) FILTER (WHERE p.points = 5)::int          AS exact_count,
  COUNT(*) FILTER (WHERE p.points = 3)::int          AS goal_diff_count,
  COUNT(*) FILTER (WHERE p.points = 1)::int          AS result_count,
  COUNT(*)::int                                      AS predictions_made,
  COUNT(*) FILTER (WHERE p.points IS NOT NULL)::int  AS predictions_scored
FROM public.boro_predictions p
LEFT JOIN public.profiles pr            ON pr.id = p.user_id
LEFT JOIN public.boro_guest_entrants ge ON ge.id = p.guest_id
GROUP BY COALESCE(p.user_id, p.guest_id), pr.display_name, ge.display_name, pr.username, pr.avatar_url, (p.guest_id IS NOT NULL);
GRANT SELECT ON public.boro_leaderboard TO anon, authenticated, service_role;

-- reminder dedupe
CREATE TABLE public.boro_prediction_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrant_kind    text NOT NULL CHECK (entrant_kind IN ('user','guest')),
  entrant_id      uuid NOT NULL,
  sent_date       date NOT NULL,
  recipient_email text NOT NULL,
  CONSTRAINT boro_prediction_reminders_unique UNIQUE (entrant_kind, entrant_id, sent_date)
);
GRANT ALL ON public.boro_prediction_reminders TO service_role;
ALTER TABLE public.boro_prediction_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boro_prediction_reminders_admin_select" ON public.boro_prediction_reminders FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management'));

CREATE OR REPLACE FUNCTION public.get_boro_reminder_recipients()
RETURNS TABLE(entrant_kind text, entrant_id uuid, recipient_email text, display_name text, missing_count int, next_kickoff_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  with upcoming as (
    select id, kickoff_at from public.boro_fixtures
    where kickoff_at > now() and kickoff_at <= now() + interval '24 hours'
  ),
  user_missing as (
    select e.user_id as entrant_id, count(*)::int as missing_count, min(u.kickoff_at) as next_kickoff_at
    from public.boro_entrants e cross join upcoming u
    where not exists (select 1 from public.boro_predictions p where p.user_id = e.user_id and p.fixture_id = u.id)
    group by e.user_id
  ),
  guest_missing as (
    select g.id as entrant_id, count(*)::int as missing_count, min(u.kickoff_at) as next_kickoff_at
    from public.boro_guest_entrants g cross join upcoming u
    where g.email is not null
      and not exists (select 1 from public.boro_predictions p where p.guest_id = g.id and p.fixture_id = u.id)
    group by g.id
  )
  select 'user'::text, um.entrant_id, au.email::text,
         coalesce(pr.display_name, pr.username, split_part(au.email::text, '@', 1)),
         um.missing_count, um.next_kickoff_at
  from user_missing um
  join auth.users au on au.id = um.entrant_id
  left join public.profiles pr on pr.id = um.entrant_id
  where au.email is not null
  union all
  select 'guest'::text, gm.entrant_id, ge.email::text,
         coalesce(ge.display_name, split_part(ge.email::text, '@', 1)),
         gm.missing_count, gm.next_kickoff_at
  from guest_missing gm
  join public.boro_guest_entrants ge on ge.id = gm.entrant_id;
$$;
