CREATE OR REPLACE FUNCTION public.request_my_order_password(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $$
DECLARE v_user uuid := auth.uid(); v_ref text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT coalesce(o.order_ref,substr(o.id::text,1,8)) INTO v_ref FROM private.orders o WHERE o.id=p_order_id AND o.user_id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.order_checkout_links l WHERE l.order_id=p_order_id) THEN RAISE EXCEPTION 'This order has no secure checkout password'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text),hashtext(p_order_id::text));
  IF EXISTS(SELECT 1 FROM public.user_notifications n WHERE n.user_id=v_user AND n.source_id=p_order_id AND n.kind='customer_order_password' AND n.created_at > now()-interval '30 seconds') THEN RETURN false; END IF;
  INSERT INTO public.user_notifications(user_id,kind,title,body,link_path,source_type,source_id)
  VALUES(v_user,'customer_order_password','Order password requested',
    'Copy the password for order '||v_ref||' using the button in this notification, then enter it to open your secure order.',
    '/shop?tab=orders','order',p_order_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.request_my_order_password(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_my_order_password(uuid) TO authenticated;