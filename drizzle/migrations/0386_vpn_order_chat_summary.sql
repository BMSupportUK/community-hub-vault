INSERT INTO public.automated_messages (key,label,category,channel,description,body,placeholders,sort_order)
VALUES ('order_placed_vpn','VPN order summary','Sales','message','Posted into the secure checkout chat when a BM Player VPN order is created.',
E'🧾 VPN order placed — thank you!\nOrder ID: {order_id}\n\nItems:\n{items}', ARRAY['order_id','order_short','items'], 101)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_checkout_link_auto_msgs()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_vpn boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT o.customer_type='vpn' INTO v_vpn FROM private.orders o WHERE o.id=NEW.order_id;
    PERFORM checkout_auto_post(NEW.order_id, CASE WHEN coalesce(v_vpn,false) THEN 'order_placed_vpn' ELSE 'order_placed_ticket' END, checkout_order_vals(NEW.order_id));
  ELSE
    IF NEW.payment_sent_at IS NOT NULL AND OLD.payment_sent_at IS NULL THEN
      PERFORM checkout_auto_post(NEW.order_id,'order_bank_transfer_reported',checkout_order_vals(NEW.order_id));
    END IF;
    IF NEW.account_setup_started_at IS NOT NULL AND OLD.account_setup_started_at IS NULL THEN
      PERFORM checkout_auto_post(NEW.order_id, CASE WHEN NEW.customer_kind IN ('existing','renewal') THEN 'order_subscription_updating' ELSE 'order_setting_up_account' END, '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END $function$;

UPDATE public.checkout_chat_messages m
SET content = regexp_replace(regexp_replace(m.content, E'\nOrder type: [^\n]*', ''), E'\nAdult content access: [^\n]*', '')
FROM private.orders o
WHERE o.id = m.order_id AND o.customer_type='vpn' AND m.content LIKE '🧾 Order placed%';