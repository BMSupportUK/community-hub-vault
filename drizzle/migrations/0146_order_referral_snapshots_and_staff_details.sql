CREATE TABLE public.order_referrals (
 order_id uuid PRIMARY KEY,
 referrer_user_id uuid NOT NULL,
 referrer_name text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_referrals TO authenticated;
GRANT ALL ON public.order_referrals TO service_role;
ALTER TABLE public.order_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read order referral names" ON public.order_referrals FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]));

CREATE FUNCTION public.capture_order_referrer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE o private.orders%ROWTYPE; customer_id uuid; kind text;
BEGIN
 IF TG_TABLE_NAME = 'orders' THEN SELECT * INTO o FROM private.orders WHERE id=NEW.id;
 ELSE SELECT * INTO o FROM private.orders WHERE id=NEW.order_id; END IF;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT customer_kind INTO kind FROM public.order_checkout_links WHERE order_id=o.id;
 IF o.customer_type='manual' THEN
   IF kind IS DISTINCT FROM 'new' THEN RETURN NEW; END IF;
   SELECT u.id INTO customer_id FROM auth.users u WHERE lower(u.email)=lower(private.app_decrypt(o.email_enc)) LIMIT 1;
 ELSE
   IF o.customer_type IS DISTINCT FROM 'new' THEN RETURN NEW; END IF;
   customer_id := o.user_id;
 END IF;
 IF customer_id IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.order_referrals(order_id,referrer_user_id,referrer_name)
 SELECT o.id,i.created_by,coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Referrer')
 FROM public.invites i JOIN public.profiles p ON p.id=i.created_by
 WHERE i.used_by=customer_id AND i.created_by<>customer_id
 ORDER BY i.used_at ASC NULLS LAST,i.created_at ASC,i.id LIMIT 1
 ON CONFLICT(order_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_order_referrer() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_new_sale_referrer AFTER INSERT ON private.orders FOR EACH ROW EXECUTE FUNCTION public.capture_order_referrer();
CREATE TRIGGER capture_manual_sale_referrer AFTER INSERT ON public.order_checkout_links FOR EACH ROW EXECUTE FUNCTION public.capture_order_referrer();

CREATE FUNCTION public.staff_checkout_order_details(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE details jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management','staff']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT jsonb_build_object(
 'ref',o.order_ref,'name',o.shipping_name,'createdAt',o.created_at,
 'totalCents',o.total_cents,'discountCents',o.discount_cents,'discountCode',o.discount_code,
 'customerKind',coalesce(l.customer_kind,CASE WHEN o.customer_type='existing' THEN 'existing' ELSE 'new' END),
 'existingUsername',o.existing_username,'adultContent',o.wants_adult_content,'method',o.manual_pay_method,'status',o.status::text,
 'email',CASE WHEN public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN private.app_decrypt(o.email_enc) ELSE NULL END,
 'referrerName',r.referrer_name,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('name',i.product_name,'qty',i.quantity,'unitCents',i.unit_price_cents) ORDER BY i.id) FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb)
 ) INTO details FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id LEFT JOIN public.order_referrals r ON r.order_id=o.id WHERE o.id=p_order_id;
 RETURN details;
END $$;
REVOKE ALL ON FUNCTION public.staff_checkout_order_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_checkout_order_details(uuid) TO authenticated,service_role;