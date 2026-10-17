CREATE OR REPLACE FUNCTION public.admin_customer_subscriptions() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 WITH paid AS (
  SELECT o.*, coalesce(CASE WHEN o.customer_type='manual' THEN coalesce(l.claimed_by,(SELECT u.id FROM auth.users u WHERE lower(u.email)=lower(private.app_decrypt(o.email_enc)) LIMIT 1)) ELSE o.user_id END,
   (SELECT c.owner_id FROM private.app_credentials c WHERE c.order_id=o.id LIMIT 1),o.id) AS customer_id
  FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id WHERE o.paid_at IS NOT NULL AND o.status::text<>'cancelled'
 ), customers AS (
  SELECT p.id user_id,p.username,p.display_name FROM public.profiles p
  WHERE EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id) OR EXISTS(SELECT 1 FROM paid WHERE paid.customer_id=p.id)
  UNION ALL
  SELECT paid.customer_id,coalesce(pc.app_login_name,paid.existing_username),paid.shipping_name FROM paid
  LEFT JOIN private.pending_order_credentials pc ON pc.order_id=paid.id
  WHERE paid.customer_id=paid.id AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=paid.customer_id)
 ), accounts AS (
  SELECT c.owner_id customer_id,c.id,c.app_login_name,c.expiry_at FROM private.app_credentials c
  UNION ALL
  SELECT paid.customer_id,paid.id,c.app_login_name,c.expiry_at FROM paid JOIN private.pending_order_credentials c ON c.order_id=paid.id
 ), rows AS (
  SELECT cu.user_id,cu.username,cu.display_name,
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'username',username,'displayName',display_name,'accounts',coalesce(accounts,'[]'::jsonb),'package',package,'renewedAt',renewed_at,'firstSubscriptionAt',first_subscription_at,'referrerName',referrer_name,'rewards',coalesce(rewards,'[]'::jsonb)) ORDER BY lower(coalesce(username,display_name,''))),'[]'::jsonb) INTO result FROM rows;
 RETURN result;
END $$;