-- Add a sequential ticket number to gate_applications
ALTER TABLE public.gate_applications
  ADD COLUMN IF NOT EXISTS ticket_number BIGSERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS gate_applications_ticket_number_key
  ON public.gate_applications(ticket_number);

-- Backfill any existing rows that pre-date the column (BIGSERIAL handles new rows).
-- Already handled by BIGSERIAL default for existing rows during ADD COLUMN.