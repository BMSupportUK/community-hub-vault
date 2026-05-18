-- Create order_invoices table for Square integration
CREATE TABLE public.order_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL UNIQUE,
  square_invoice_id TEXT NOT NULL,
  square_order_id TEXT,
  invoice_number TEXT,
  public_url TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  created_by UUID,
  last_synced_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_invoices_square_id ON public.order_invoices(square_invoice_id);
CREATE INDEX idx_order_invoices_status ON public.order_invoices(status);

ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/management view invoices"
  ON public.order_invoices FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins/management insert invoices"
  ON public.order_invoices FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins/management update invoices"
  ON public.order_invoices FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins/management delete invoices"
  ON public.order_invoices FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER trg_order_invoices_updated_at
  BEFORE UPDATE ON public.order_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: on status -> PAID, mark order paid, post chat message, notify
CREATE OR REPLACE FUNCTION public.handle_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_order_user_id UUID;
  v_uname TEXT;
BEGIN
  IF NEW.status = 'PAID' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Mark order paid
    UPDATE private.orders
      SET status = 'paid'::order_status,
          paid_at = COALESCE(paid_at, now()),
          updated_at = now()
      WHERE id = NEW.order_id AND status <> 'paid'::order_status AND status <> 'completed'::order_status;

    SELECT user_id INTO v_order_user_id FROM private.orders WHERE id = NEW.order_id;

    -- Post system message in order chat
    BEGIN
      INSERT INTO public.order_messages (order_id, sender_id, content, is_system)
      VALUES (NEW.order_id, NULL, 'Payment received via Square invoice' ||
              CASE WHEN NEW.invoice_number IS NOT NULL THEN ' #' || NEW.invoice_number ELSE '' END ||
              '. Order marked as paid.', true);
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      -- fallback without is_system column
      BEGIN
        INSERT INTO public.order_messages (order_id, sender_id, content)
        VALUES (NEW.order_id, COALESCE(NEW.created_by, v_order_user_id),
                'Payment received via Square invoice. Order marked as paid.');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;

    -- Notify admins
    INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
    VALUES ('invoice_paid', 'Invoice paid',
            'Square invoice paid for order',
            '/shop?view=orders&id=' || NEW.order_id::text,
            NEW.order_id);

    NEW.paid_at := COALESCE(NEW.paid_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_paid
  BEFORE UPDATE ON public.order_invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_paid();