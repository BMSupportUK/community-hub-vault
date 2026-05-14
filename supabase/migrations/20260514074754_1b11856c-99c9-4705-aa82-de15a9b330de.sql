
-- Extend orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS existing_username text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_by uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_by uuid;

-- Discount codes table
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  percent integer,
  amount_cents integer,
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discount manage admin" ON public.discount_codes;
CREATE POLICY "discount manage admin" ON public.discount_codes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

DROP POLICY IF EXISTS "discount read own or global" ON public.discount_codes;
CREATE POLICY "discount read own or global" ON public.discount_codes FOR SELECT TO authenticated
  USING (
    is_active = true AND (
      user_id IS NULL OR user_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
    )
  );

CREATE TRIGGER tg_discount_codes_updated_at
  BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Update order notification to use £
CREATE OR REPLACE FUNCTION public.notify_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uname TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('order_placed', 'New order', uname || ' placed an order (£' || (NEW.total_cents/100.0)::numeric(10,2) || ')', '/shop?view=admin', NEW.id);
  RETURN NEW;
END; $function$;
