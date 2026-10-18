CREATE TABLE public.manual_customer_names (
  customer_id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.manual_customer_names TO authenticated;
GRANT ALL ON public.manual_customer_names TO service_role;
ALTER TABLE public.manual_customer_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read manual customer names" ON public.manual_customer_names
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.admin_set_manual_customer_name(p_customer_id uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text := trim(coalesce(p_name,''));
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v = '' OR length(v) > 120 THEN RAISE EXCEPTION 'Enter a name up to 120 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id) THEN RAISE EXCEPTION 'Site accounts use the Site username field'; END IF;
  IF EXISTS (SELECT 1 FROM public.manual_name_customers WHERE id = p_customer_id) THEN
    UPDATE public.manual_name_customers SET name = v WHERE id = p_customer_id;
  ELSE
    INSERT INTO public.manual_customer_names(customer_id, name, updated_by) VALUES (p_customer_id, v, auth.uid())
    ON CONFLICT (customer_id) DO UPDATE SET name = excluded.name, updated_by = excluded.updated_by, updated_at = now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_manual_customer_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_manual_customer_name(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_customer_subscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 WITH paid AS (
  SELECT o.*, CASE WHEN o.customer_type='manual' OR o.order_ref LIKE 'MANUAL-%' THEN coalesce(l.renewal_customer_id,o.id) ELSE coalesce(o.user_id,(SELECT c.owner_id FROM private.app_credentials c WHERE c.order_id=o.id LIMIT 1),o.id) END AS customer_id
  FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id WHERE o.paid_at IS NOT NULL AND o.status::text<>'cancelled'
 ), customers AS (
  SELECT p.id user_id,p.username,p.display_name,true AS has_site FROM public.profiles p
  WHERE EXISTS(SELECT 1 FROM public.manually_added_customers m WHERE m.user_id=p.id) OR EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id) OR EXISTS(SELECT 1 FROM paid WHERE paid.customer_id=p.id)
  UNION ALL
  (SELECT DISTINCT ON (paid.customer_id) paid.customer_id,coalesce(nm.name,pc.app_login_name,paid.existing_username),paid.shipping_name,false
  FROM paid
  LEFT JOIN private.pending_order_credentials pc ON pc.order_id=paid.id
  LEFT JOIN public.manual_customer_names nm ON nm.customer_id=paid.customer_id
  WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id) ORDER BY paid.customer_id,paid.created_at,paid.id)
  UNION ALL
  SELECT n.id,NULL,n.name,false FROM public.manual_name_customers n
 ), accounts AS (
  SELECT c.owner_id customer_id,c.id,c.app_login_name,c.expiry_at FROM private.app_credentials c WHERE NOT EXISTS(SELECT 1 FROM paid WHERE paid.id=c.order_id AND (paid.customer_type='manual' OR paid.order_ref LIKE 'MANUAL-%'))
  UNION ALL
  SELECT paid.customer_id,paid.id,coalesce(c.app_login_name,cr.app_login_name,paid.existing_username,paid.shipping_name),coalesce(l.subscription_expiry_at,c.expiry_at,cr.expiry_at,CASE WHEN term.months>0 THEN paid.created_at+make_interval(months=>term.months) END) FROM paid LEFT JOIN private.pending_order_credentials c ON c.order_id=paid.id LEFT JOIN public.order_checkout_links l ON l.order_id=paid.id LEFT JOIN LATERAL (SELECT app_login_name,expiry_at FROM private.app_credentials WHERE order_id=paid.id LIMIT 1) cr ON true LEFT JOIN LATERAL (SELECT sum(public.package_item_months(i.product_name)*greatest(coalesce(i.quantity,1),1))::int months FROM public.order_items i WHERE i.order_id=paid.id) term ON true WHERE l.renewal_account_id IS NULL AND (paid.customer_type='manual' OR paid.order_ref LIKE 'MANUAL-%' OR c.order_id IS NOT NULL)
 ), rows AS (
  SELECT cu.user_id,cu.username,cu.display_name,cu.has_site,
   (SELECT jsonb_agg(jsonb_build_object('id',c.id,'login',c.app_login_name,'expiresAt',c.expiry_at) ORDER BY c.expiry_at NULLS LAST) FROM accounts c WHERE c.customer_id=cu.user_id) accounts,
   (SELECT string_agg(i.quantity||' × '||i.product_name,', ' ORDER BY i.id) FROM order_items i WHERE i.order_id=(SELECT id FROM paid WHERE customer_id=cu.user_id ORDER BY paid_at DESC,created_at DESC,id LIMIT 1)) package,
   (SELECT max(paid_at) FROM paid WHERE customer_id=cu.user_id AND (customer_type='existing' OR EXISTS(SELECT 1 FROM order_checkout_links l WHERE l.order_id=paid.id AND l.customer_kind IN('existing','renewal')))) renewed_at,
   (SELECT min(paid_at) FROM paid WHERE customer_id=cu.user_id) first_subscription_at,
   coalesce((SELECT r.referrer_name FROM order_referrals r JOIN paid ON paid.id=r.order_id WHERE paid.customer_id=cu.user_id ORDER BY paid.created_at LIMIT 1),
    (SELECT coalesce(nullif(trim(rp.display_name),''),rp.username) FROM invites i JOIN profiles rp ON rp.id=i.created_by WHERE i.used_by=cu.user_id AND i.created_by<>cu.user_id ORDER BY i.used_at NULLS LAST,i.created_at LIMIT 1)) referrer_name,
   (SELECT jsonb_agg(jsonb_build_object('orderId',paid.id,'ref',paid.order_ref,'paidAt',paid.paid_at,'referrerId',r.referrer_user_id,'referrerName',r.referrer_name,
     'referrerAccounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'login',c.app_login_name,'expiresAt',c.expiry_at) ORDER BY c.expiry_at) FROM private.app_credentials c WHERE c.owner_id=r.referrer_user_id),'[]'::jsonb),'rewardedAt',w.awarded_at) ORDER BY paid.paid_at)
    FROM paid JOIN order_referrals r ON r.order_id=paid.id LEFT JOIN referral_month_rewards w ON w.order_id=paid.id
    WHERE paid.customer_id=cu.user_id AND public.referral_reward_eligible(paid.id)) rewards
  FROM customers cu
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'username',username,'displayName',display_name,'hasSiteAccount',has_site,'accounts',coalesce(accounts,'[]'::jsonb),'package',package,'renewedAt',renewed_at,'firstSubscriptionAt',first_subscription_at,'referrerName',referrer_name,'rewards',coalesce(rewards,'[]'::jsonb)) ORDER BY lower(coalesce(username,display_name,''))),'[]'::jsonb) INTO result FROM rows;
 RETURN result;
END $function$;