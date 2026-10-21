CREATE OR REPLACE FUNCTION public.get_my_order_chat_access(p_order_id uuid)
RETURNS TABLE(token text, password text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private.orders o WHERE o.id=p_order_id AND o.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT l.token,l.password FROM public.order_checkout_links l WHERE l.order_id=p_order_id;
END $$;
REVOKE ALL ON FUNCTION public.get_my_order_chat_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_order_chat_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_customer_order_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $$
DECLARE o record;
BEGIN
  SELECT id,user_id,paid_at,status,order_ref INTO o FROM private.orders WHERE id=NEW.order_id;
  IF o.user_id IS NULL OR NEW.claimed_by IS DISTINCT FROM o.user_id OR o.paid_at IS NOT NULL OR o.status::text IN ('completed','cancelled') THEN RETURN NEW; END IF;
  INSERT INTO public.user_notifications(user_id,kind,title,body,link_path,source_type,source_id)
  VALUES(o.user_id,'customer_order_payment','Order placed — please pay',
    'Your order ' || coalesce(o.order_ref,substr(o.id::text,1,8)) || ' is ready. Please pay to continue. Copy your secure-chat password from this notification to open your order and chat with the team.',
    '/shop?tab=orders','order',o.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_customer_order_payment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customer_order_payment_notice AFTER INSERT ON public.order_checkout_links
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order_payment();