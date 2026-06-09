
ALTER TABLE public.wc_fixtures
  ADD COLUMN IF NOT EXISTS match_no int UNIQUE,
  ADD COLUMN IF NOT EXISTS home_seed text,
  ADD COLUMN IF NOT EXISTS away_seed text;

-- Wipe any prior knockout rows so this is idempotent
DELETE FROM public.wc_fixtures WHERE stage <> 'group';

INSERT INTO public.wc_fixtures (stage, match_no, home_seed, away_seed, home_team, away_team, kickoff_at) VALUES
-- Round of 32
('r32', 73, '2A', '2B', 'Runner-up Group A', 'Runner-up Group B', '2026-06-28 19:00+00'),
('r32', 74, '1E', NULL, 'Winner Group E',    '3rd Group A/B/C/D/F','2026-06-29 20:30+00'),
('r32', 76, '1C', '2F', 'Winner Group C',    'Runner-up Group F', '2026-06-29 17:00+00'),
('r32', 75, '1F', '2C', 'Winner Group F',    'Runner-up Group C', '2026-06-30 01:00+00'),
('r32', 77, '1I', NULL, 'Winner Group I',    '3rd Group C/D/F/G/H','2026-06-30 21:00+00'),
('r32', 78, '2E', '2I', 'Runner-up Group E', 'Runner-up Group I', '2026-06-30 17:00+00'),
('r32', 79, '1A', NULL, 'Winner Group A',    '3rd Group C/E/F/H/I','2026-07-01 01:00+00'),
('r32', 80, '1L', NULL, 'Winner Group L',    '3rd Group E/H/I/J/K','2026-07-01 16:00+00'),
('r32', 81, '1D', NULL, 'Winner Group D',    '3rd Group B/E/F/I/J','2026-07-02 00:00+00'),
('r32', 82, '1G', NULL, 'Winner Group G',    '3rd Group A/E/H/I/J','2026-07-01 20:00+00'),
('r32', 83, '2K', '2L', 'Runner-up Group K', 'Runner-up Group L', '2026-07-02 23:00+00'),
('r32', 84, '1H', '2J', 'Winner Group H',    'Runner-up Group J', '2026-07-02 19:00+00'),
('r32', 85, '1B', NULL, 'Winner Group B',    '3rd Group E/F/G/I/J','2026-07-03 03:00+00'),
('r32', 86, '1J', '2H', 'Winner Group J',    'Runner-up Group H', '2026-07-03 22:00+00'),
('r32', 87, '1K', NULL, 'Winner Group K',    '3rd Group D/E/I/J/L','2026-07-04 01:30+00'),
('r32', 88, '2D', '2G', 'Runner-up Group D', 'Runner-up Group G', '2026-07-03 18:00+00'),
-- Round of 16
('r16', 89, 'W74','W77','Winner Match 74','Winner Match 77','2026-07-04 21:00+00'),
('r16', 90, 'W73','W75','Winner Match 73','Winner Match 75','2026-07-04 17:00+00'),
('r16', 91, 'W76','W78','Winner Match 76','Winner Match 78','2026-07-05 20:00+00'),
('r16', 92, 'W79','W80','Winner Match 79','Winner Match 80','2026-07-06 00:00+00'),
('r16', 93, 'W83','W84','Winner Match 83','Winner Match 84','2026-07-06 19:00+00'),
('r16', 94, 'W81','W82','Winner Match 81','Winner Match 82','2026-07-07 00:00+00'),
('r16', 95, 'W86','W88','Winner Match 86','Winner Match 88','2026-07-07 16:00+00'),
('r16', 96, 'W85','W87','Winner Match 85','Winner Match 87','2026-07-07 20:00+00'),
-- Quarter-finals
('qf',  97, 'W89','W90','Winner Match 89','Winner Match 90','2026-07-09 20:00+00'),
('qf',  98, 'W93','W94','Winner Match 93','Winner Match 94','2026-07-10 19:00+00'),
('qf',  99, 'W91','W92','Winner Match 91','Winner Match 92','2026-07-11 21:00+00'),
('qf', 100, 'W95','W96','Winner Match 95','Winner Match 96','2026-07-12 01:00+00'),
-- Semi-finals
('sf', 101, 'W97','W98','Winner Match 97','Winner Match 98','2026-07-14 19:00+00'),
('sf', 102, 'W99','W100','Winner Match 99','Winner Match 100','2026-07-15 19:00+00'),
-- Third place
('third', 103, 'L101','L102','Loser Match 101','Loser Match 102','2026-07-18 21:00+00'),
-- Final
('final', 104, 'W101','W102','Winner Match 101','Winner Match 102','2026-07-19 19:00+00');

-- ---- Auto-progression function & trigger -------------------------------
CREATE OR REPLACE FUNCTION public.wc_apply_progression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scored_count int;
  v_winner text;
  v_runner text;
  v_w text;
  v_l text;
BEGIN
  IF NEW.home_score IS NULL OR NEW.away_score IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.stage = 'group' AND NEW.group_label IS NOT NULL THEN
    SELECT count(*) INTO scored_count
      FROM public.wc_fixtures
      WHERE stage = 'group' AND group_label = NEW.group_label
        AND home_score IS NOT NULL AND away_score IS NOT NULL;
    IF scored_count = 6 THEN
      WITH games AS (
        SELECT home_team AS team, home_score AS gf, away_score AS ga
          FROM public.wc_fixtures
          WHERE stage='group' AND group_label = NEW.group_label
        UNION ALL
        SELECT away_team, away_score, home_score
          FROM public.wc_fixtures
          WHERE stage='group' AND group_label = NEW.group_label
      ), standing AS (
        SELECT team,
          SUM(CASE WHEN gf>ga THEN 3 WHEN gf=ga THEN 1 ELSE 0 END) AS pts,
          SUM(gf - ga) AS gd,
          SUM(gf)      AS gf_total
        FROM games GROUP BY team
      )
      SELECT team INTO v_winner FROM standing ORDER BY pts DESC, gd DESC, gf_total DESC LIMIT 1;
      SELECT team INTO v_runner FROM standing ORDER BY pts DESC, gd DESC, gf_total DESC OFFSET 1 LIMIT 1;

      UPDATE public.wc_fixtures SET home_team = v_winner WHERE home_seed = '1'||NEW.group_label;
      UPDATE public.wc_fixtures SET away_team = v_winner WHERE away_seed = '1'||NEW.group_label;
      UPDATE public.wc_fixtures SET home_team = v_runner WHERE home_seed = '2'||NEW.group_label;
      UPDATE public.wc_fixtures SET away_team = v_runner WHERE away_seed = '2'||NEW.group_label;
    END IF;
  ELSIF NEW.stage IN ('r32','r16','qf','sf') AND NEW.match_no IS NOT NULL THEN
    IF NEW.home_score > NEW.away_score THEN
      v_w := NEW.home_team; v_l := NEW.away_team;
    ELSIF NEW.away_score > NEW.home_score THEN
      v_w := NEW.away_team; v_l := NEW.home_team;
    ELSE
      RETURN NEW; -- tie: admin must edit the next fixture manually
    END IF;
    UPDATE public.wc_fixtures SET home_team = v_w WHERE home_seed = 'W'||NEW.match_no;
    UPDATE public.wc_fixtures SET away_team = v_w WHERE away_seed = 'W'||NEW.match_no;
    UPDATE public.wc_fixtures SET home_team = v_l WHERE home_seed = 'L'||NEW.match_no;
    UPDATE public.wc_fixtures SET away_team = v_l WHERE away_seed = 'L'||NEW.match_no;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wc_apply_progression_trg ON public.wc_fixtures;
CREATE TRIGGER wc_apply_progression_trg
  AFTER UPDATE OF home_score, away_score ON public.wc_fixtures
  FOR EACH ROW
  EXECUTE FUNCTION public.wc_apply_progression();
