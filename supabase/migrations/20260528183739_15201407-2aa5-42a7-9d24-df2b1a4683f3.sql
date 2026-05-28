-- Refresh PostgREST schema cache so the newly-added tickets.order_id column
-- is visible to inserts coming through the Data API.
NOTIFY pgrst, 'reload schema';

-- Backfill order_id for tickets that were created before the schema cache
-- caught up. We match by the short order prefix embedded in the subject.
UPDATE public.tickets t
SET order_id = o.id
FROM public.orders o
WHERE t.order_id IS NULL
  AND t.subject LIKE 'New order #%'
  AND substring(o.id::text, 1, 8) = substring(t.subject from 'New order #(........)');