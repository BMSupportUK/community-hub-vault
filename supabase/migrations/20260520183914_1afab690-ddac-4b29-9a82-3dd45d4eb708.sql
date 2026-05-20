
CREATE TABLE public.crypto_payout_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  asset text NOT NULL DEFAULT 'USDT',
  network text NOT NULL DEFAULT 'TRC20',
  wallet_address text NOT NULL DEFAULT '',
  fx_source text NOT NULL DEFAULT 'coingecko',
  markup_pct numeric(6,3) NOT NULL DEFAULT 1.5,
  min_payout_usdt numeric(18,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.crypto_payout_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crypto_payout_settings admin all"
ON public.crypto_payout_settings FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

INSERT INTO public.crypto_payout_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.crypto_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped')),
  gbp_amount_cents integer NOT NULL,
  gbp_to_usdt_rate numeric(18,8),
  usdt_amount numeric(18,2),
  asset text NOT NULL,
  network text NOT NULL,
  wallet_address text NOT NULL,
  markup_pct numeric(6,3) NOT NULL DEFAULT 0,
  tx_hash text,
  notes text,
  sent_at timestamptz,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crypto_payouts_status ON public.crypto_payouts(status, created_at DESC);

ALTER TABLE public.crypto_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crypto_payouts admin all"
ON public.crypto_payouts FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TRIGGER trg_crypto_payouts_updated_at
BEFORE UPDATE ON public.crypto_payouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: when an order_invoices row becomes PAID, snapshot a pending crypto payout
CREATE OR REPLACE FUNCTION public.create_crypto_payout_on_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  s public.crypto_payout_settings%ROWTYPE;
  v_total integer;
BEGIN
  IF upper(COALESCE(NEW.status,'')) = 'PAID'
     AND upper(COALESCE(OLD.status,'')) IS DISTINCT FROM 'PAID' THEN
    SELECT * INTO s FROM public.crypto_payout_settings WHERE id = true;
    IF s.wallet_address IS NULL OR s.wallet_address = '' THEN
      RETURN NEW;
    END IF;

    SELECT total_cents INTO v_total FROM private.orders WHERE id = NEW.order_id;
    IF v_total IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.crypto_payouts (
      order_id, status, gbp_amount_cents, asset, network, wallet_address, markup_pct
    ) VALUES (
      NEW.order_id, 'pending', v_total,
      s.asset, s.network, s.wallet_address, s.markup_pct
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_crypto_payout_on_invoice_paid
AFTER UPDATE OF status ON public.order_invoices
FOR EACH ROW EXECUTE FUNCTION public.create_crypto_payout_on_invoice_paid();

ALTER PUBLICATION supabase_realtime ADD TABLE public.crypto_payouts;
