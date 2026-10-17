CREATE OR REPLACE FUNCTION public.checkout_order_vals(p_order uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public, private AS $$
  SELECT jsonb_build_object(
    'order_id', coalesce(o.order_ref, o.id::text),
    'order_short', coalesce(o.order_ref, left(o.id::text,8)),
    'total', '£'||to_char(o.total_cents/100.0,'FM999990.00')||' GBP',
    'order_type', CASE WHEN l.customer_kind IN ('existing','renewal') THEN 'Renewal' ELSE 'New account' END,
    'existing_accounts', CASE WHEN coalesce(o.existing_username,'')<>'' THEN E'\nExisting account: '||o.existing_username ELSE '' END,
    'adult_access', CASE WHEN o.wants_adult_content THEN 'Yes' ELSE 'No' END,
    'items', coalesce((SELECT string_agg('• '||coalesce(i.product_name,'Item')||' × '||i.quantity, E'\n') FROM public.order_items i WHERE i.order_id=o.id),''),
    'provider', coalesce((SELECT initcap(p.provider) FROM public.order_payments p WHERE p.order_id=o.id ORDER BY p.created_at DESC LIMIT 1), initcap(o.manual_pay_method), 'card'),
    'paid_at', to_char(coalesce(o.paid_at,now()) AT TIME ZONE 'Europe/London','DD Mon YYYY HH24:MI'),
    'reported_at', to_char(now() AT TIME ZONE 'Europe/London','DD Mon YYYY HH24:MI'),
    'reference', coalesce(o.order_ref, left(o.id::text,8)))
  FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id WHERE o.id=p_order
$$;
REVOKE ALL ON FUNCTION public.checkout_order_vals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_checkout_link_auto_msgs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM checkout_auto_post(NEW.order_id,'order_placed_ticket',checkout_order_vals(NEW.order_id));
  ELSE
    IF NEW.payment_sent_at IS NOT NULL AND OLD.payment_sent_at IS NULL THEN
      PERFORM checkout_auto_post(NEW.order_id,'order_bank_transfer_reported',checkout_order_vals(NEW.order_id));
    END IF;
    IF NEW.account_setup_started_at IS NOT NULL AND OLD.account_setup_started_at IS NULL THEN
      PERFORM checkout_auto_post(NEW.order_id, CASE WHEN NEW.customer_kind IN ('existing','renewal') THEN 'order_subscription_updating' ELSE 'order_setting_up_account' END, '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_order_checkout_auto_msgs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, private AS $$
DECLARE kind text; bank boolean;
BEGIN
  SELECT customer_kind INTO kind FROM public.order_checkout_links WHERE order_id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    bank := coalesce(NEW.manual_pay_method,'') ILIKE '%bank%' AND NOT EXISTS (SELECT 1 FROM public.order_payments p WHERE p.order_id=NEW.id);
    PERFORM checkout_auto_post(NEW.id, CASE WHEN bank THEN 'order_bank_transfer_received' ELSE 'order_payment_received' END, checkout_order_vals(NEW.id));
  END IF;
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    PERFORM checkout_auto_post(NEW.id, CASE WHEN kind IN ('existing','renewal') THEN 'order_renewal_completed' ELSE 'order_sale_completed' END, '{}'::jsonb);
  END IF;
  IF NEW.status::text='cancelled' AND OLD.status::text IS DISTINCT FROM 'cancelled' THEN
    PERFORM checkout_auto_post(NEW.id,'order_cancelled',jsonb_build_object('cancelled_by', CASE WHEN auth.uid() IS NOT NULL AND auth.uid()=NEW.user_id THEN 'you' ELSE 'BM Support' END));
  END IF;
  RETURN NEW;
END $$;