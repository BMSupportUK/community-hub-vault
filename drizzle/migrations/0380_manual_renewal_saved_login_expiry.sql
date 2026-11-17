CREATE OR REPLACE FUNCTION public.staff_set_order_credential_expiry(p_order_id uuid, p_credential_id uuid, p_expiry timestamp with time zone)
 RETURNS timestamp with time zone LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE l public.order_checkout_links%ROWTYPE; o private.orders%ROWTYPE;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO o FROM private.orders WHERE id=p_order_id FOR UPDATE;
 SELECT * INTO l FROM public.order_checkout_links WHERE order_id=p_order_id FOR UPDATE;
 IF l.renewal_account_id IS NULL THEN RETURN private.staff_set_order_credential_expiry_legacy(p_order_id,p_credential_id,p_expiry); END IF;
 IF p_credential_id IS DISTINCT FROM l.renewal_account_id THEN RAISE EXCEPTION 'That account does not belong to this renewal'; END IF;
 IF o.paid_at IS NULL OR o.status::text='cancelled' THEN RAISE EXCEPTION 'The order must be paid and not cancelled'; END IF;
 IF p_expiry IS NULL OR p_expiry<=now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
 IF l.renewal_applied_at IS NOT NULL THEN RAISE EXCEPTION 'This renewal has already been applied'; END IF;
 PERFORM public.staff_order_linked_renewal_account(p_order_id);
 -- The renewed account is either an earlier manual order's login, or a saved login owned by this manual customer.
 UPDATE public.order_checkout_links SET subscription_expiry_at=p_expiry WHERE order_id=l.renewal_account_id;
 IF FOUND THEN
  UPDATE private.pending_order_credentials SET expiry_at=p_expiry WHERE order_id=l.renewal_account_id;
 ELSE
  UPDATE private.app_credentials SET expiry_at=p_expiry WHERE id=l.renewal_account_id AND owner_id=l.renewal_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original manual account not found'; END IF;
 END IF;
 UPDATE public.order_checkout_links SET subscription_expiry_at=p_expiry,renewal_applied_at=now(),renewal_credential_id=p_credential_id WHERE order_id=p_order_id;
 RETURN p_expiry;
END $function$;