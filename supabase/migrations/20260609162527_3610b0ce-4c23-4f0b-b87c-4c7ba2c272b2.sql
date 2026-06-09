-- Add archived_at to tickets and a function to auto-archive closed tickets older than 7 days
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tickets_archived_at ON public.tickets(archived_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status_closed_at ON public.tickets(status, closed_at) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.archive_old_closed_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.tickets
    SET archived_at = now()
    WHERE archived_at IS NULL
      AND status IN ('closed','resolved')
      AND closed_at IS NOT NULL
      AND closed_at < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_old_closed_tickets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_old_closed_tickets() TO service_role;