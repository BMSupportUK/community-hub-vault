CREATE OR REPLACE FUNCTION public.tg_wc_score_on_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'FINISHED'
     AND NEW.home_score IS NOT NULL
     AND NEW.away_score IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.home_score IS DISTINCT FROM NEW.home_score
          OR OLD.away_score IS DISTINCT FROM NEW.away_score) THEN
    PERFORM public.wc_score_fixture(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wc_score_on_finish_trg ON public.wc_fixtures;
CREATE TRIGGER wc_score_on_finish_trg
AFTER UPDATE ON public.wc_fixtures
FOR EACH ROW
EXECUTE FUNCTION public.tg_wc_score_on_finish();

-- Backfill: award points for every finished fixture that has a score
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wc_fixtures
           WHERE status = 'FINISHED' AND home_score IS NOT NULL AND away_score IS NOT NULL LOOP
    PERFORM public.wc_score_fixture(r.id);
  END LOOP;
END$$;