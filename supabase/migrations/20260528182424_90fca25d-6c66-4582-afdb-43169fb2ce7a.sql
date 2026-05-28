ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS order_id uuid;
CREATE INDEX IF NOT EXISTS idx_tickets_order ON public.tickets(order_id);