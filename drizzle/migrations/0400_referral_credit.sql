CREATE TABLE public.referral_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_pence integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('referral','spend','refund','adjust')),
  order_id uuid,
  referred_name text,
  package_name text,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referral_credit_one_reward ON public.referral_credit_ledger(order_id) WHERE kind='referral';
CREATE UNIQUE INDEX referral_credit_one_spend ON public.referral_credit_ledger(order_id) WHERE kind='spend';
CREATE UNIQUE INDEX referral_credit_one_refund ON public.referral_credit_ledger(order_id) WHERE kind='refund';
CREATE INDEX referral_credit_user ON public.referral_credit_ledger(user_id, created_at DESC);
GRANT SELECT ON public.referral_credit_ledger TO authenticated;
GRANT ALL ON public.referral_credit_ledger TO service_role;
ALTER TABLE public.referral_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own referral credit" ON public.referral_credit_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]));

-- Reward for one package name, in pence (12-month packages only).
CREATE OR REPLACE FUNCTION public.referral_credit_for_package(p_name text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN public.package_item_months(p_name) IS DISTINCT FROM 12 THEN 0
    WHEN p_name ILIKE '%triple%' THEN 1300
    WHEN p_name ILIKE '%multi%' THEN 900
    ELSE 500 END
$$;

CREATE OR REPLACE FUNCTION public.referral_credit_balance(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(amount_pence),0)::int FROM public.referral_credit_ledger WHERE user_id = p_user
$$;

CREATE OR REPLACE FUNCTION public.my_referral_credit()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.referral_credit_balance(auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.my_referral_credit() TO authenticated;

-- Award on completion: referred new customer's very first order only.
CREATE OR REPLACE FUNCTION public.award_referral_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE r public.order_referrals%ROWTYPE; amt int; pkg text; earlier boolean;
BEGIN
  IF NEW.status::text <> 'completed' OR NEW.paid_at IS NULL THEN RETURN NEW; END IF;
  IF OLD.status::text = 'completed' AND OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.order_referrals WHERE order_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF public.referral_reward_referrer_excluded(r.referrer_user_id, r.referrer_name) THEN RETURN NEW; END IF;
  IF NEW.customer_type = 'new' THEN
    SELECT EXISTS(SELECT 1 FROM private.orders o WHERE o.user_id = NEW.user_id AND o.id <> NEW.id
      AND o.created_at < NEW.created_at AND o.status::text <> 'cancelled' AND coalesce(o.customer_type,'') <> 'vpn') INTO earlier;
    IF earlier THEN RETURN NEW; END IF;
  ELSIF NEW.customer_type = 'manual' THEN
    IF NOT EXISTS(SELECT 1 FROM public.order_checkout_links l WHERE l.order_id = NEW.id AND l.customer_kind = 'new') THEN RETURN NEW; END IF;
  ELSE RETURN NEW; END IF;
  SELECT i.product_name, public.referral_credit_for_package(i.product_name) INTO pkg, amt
    FROM public.order_items i WHERE i.order_id = NEW.id
    ORDER BY public.referral_credit_for_package(i.product_name) DESC LIMIT 1;
  IF coalesce(amt,0) <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.referral_credit_ledger(user_id, amount_pence, kind, order_id, referred_name, package_name, reason)
  VALUES (r.referrer_user_id, amt, 'referral', NEW.id, NEW.shipping_name, pkg, 'Referral reward')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_notifications(user_id, title, body, link)
  SELECT r.referrer_user_id, 'Referral credit added', 'You earned £' || to_char(amt/100.0,'FM990.00') || ' credit for referring a new customer.', '/leaderboard'
  WHERE EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notifications' AND column_name='link');
  RETURN NEW;
END $$;
CREATE TRIGGER award_referral_credit AFTER UPDATE OF status, paid_at ON private.orders
  FOR EACH ROW EXECUTE FUNCTION public.award_referral_credit();

-- Refund spent credit if the order is cancelled.
CREATE OR REPLACE FUNCTION public.refund_referral_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE s public.referral_credit_ledger%ROWTYPE;
BEGIN
  IF NEW.status::text <> 'cancelled' OR OLD.status::text = 'cancelled' THEN RETURN NEW; END IF;
  SELECT * INTO s FROM public.referral_credit_ledger WHERE order_id = NEW.id AND kind = 'spend';
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.referral_credit_ledger(user_id, amount_pence, kind, order_id, reason)
  VALUES (s.user_id, -s.amount_pence, 'refund', NEW.id, 'Order cancelled') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER refund_referral_credit AFTER UPDATE OF status ON private.orders
  FOR EACH ROW EXECUTE FUNCTION public.refund_referral_credit();

-- Customer applies credit to their own unpaid order.
CREATE OR REPLACE FUNCTION public.apply_referral_credit(p_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE o private.orders%ROWTYPE; bal int; use int;
BEGIN
  SELECT * INTO o FROM private.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.paid_at IS NOT NULL OR o.status::text <> 'pending' THEN RAISE EXCEPTION 'Order already paid'; END IF;
  IF EXISTS(SELECT 1 FROM public.referral_credit_ledger WHERE order_id = p_order_id AND kind = 'spend') THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('refcredit:' || auth.uid()::text));
  bal := public.referral_credit_balance(auth.uid());
  use := least(bal, coalesce(o.total_cents,0));
  IF use <= 0 THEN RETURN 0; END IF;
  INSERT INTO public.referral_credit_ledger(user_id, amount_pence, kind, order_id, reason)
  VALUES (auth.uid(), -use, 'spend', p_order_id, 'Used at checkout');
  UPDATE private.orders SET total_cents = total_cents - use, discount_cents = coalesce(discount_cents,0) + use, updated_at = now() WHERE id = p_order_id;
  RETURN use;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_referral_credit(uuid) TO authenticated;

-- Admin/management manual adjustment.
CREATE OR REPLACE FUNCTION public.admin_adjust_referral_credit(p_user uuid, p_amount_pence integer, p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_amount_pence = 0 THEN RAISE EXCEPTION 'Enter an amount'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF public.referral_credit_balance(p_user) + p_amount_pence < 0 THEN RAISE EXCEPTION 'Credit cannot go below £0'; END IF;
  INSERT INTO public.referral_credit_ledger(user_id, amount_pence, kind, reason, created_by) VALUES (p_user, p_amount_pence, 'adjust', trim(p_reason), auth.uid());
  RETURN public.referral_credit_balance(p_user);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_adjust_referral_credit(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_referral_credit_balances()
RETURNS TABLE(user_id uuid, balance_pence integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT l.user_id, sum(l.amount_pence)::int FROM public.referral_credit_ledger l GROUP BY l.user_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_referral_credit_balances() TO authenticated;