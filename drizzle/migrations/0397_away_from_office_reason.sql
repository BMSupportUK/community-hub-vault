-- "Away from the office" is a new manually-ended Away reason, so both places that store a
-- reason must accept it: the live status row and the shift-linked history log.
ALTER TABLE public.user_dnd_status DROP CONSTRAINT IF EXISTS staff_away_reason;
ALTER TABLE public.user_dnd_status
  ADD CONSTRAINT staff_away_reason
  CHECK (reason IS NULL OR reason IN ('Toilet Break','Smoking Break','Meeting','Away from the office','Outside Of Office Hours'));

DO $$
DECLARE r record;
BEGIN
  -- The log's reason check was created inline, so drop whatever check names exist there.
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.away_log'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%reason%'
  LOOP
    EXECUTE format('ALTER TABLE public.away_log DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.away_log
  ADD CONSTRAINT away_log_reason_check
  CHECK (reason IN ('Toilet Break','Smoking Break','Meeting','Away from the office','Outside Of Office Hours'));