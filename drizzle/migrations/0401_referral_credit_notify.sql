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
  IF FOUND THEN
    INSERT INTO public.user_notifications(user_id, kind, title, body, link_path)
    VALUES (r.referrer_user_id, 'referral_credit', 'Referral credit added', 'You earned £' || to_char(amt/100.0,'FM990.00') || ' credit for referring a new customer.', '/leaderboard');
  END IF;
  RETURN NEW;
END $$;