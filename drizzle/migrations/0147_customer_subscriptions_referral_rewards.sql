CREATE TABLE public.referral_month_rewards (
 order_id uuid PRIMARY KEY,
 referrer_user_id uuid NOT NULL,
 credential_id uuid NOT NULL,
 previous_expiry_at timestamptz,
 new_expiry_at timestamptz NOT NULL,
 awarded_by uuid NOT NULL,
 awarded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_month_rewards TO authenticated;
GRANT ALL ON public.referral_month_rewards TO service_role;
ALTER TABLE public.referral_month_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read referral rewards" ON public.referral_month_rewards FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.package_item_months(p_name text) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n text := lower(coalesce(p_name,'')); m text[];
BEGIN
 m := regexp_match(n,'([0-9]+)\s*(year|yr)s?\y'); IF m IS NOT NULL THEN RETURN m[1]::integer*12; END IF;
 IF n ~ '\y(a|one)\s*year\y' THEN RETURN 12; END IF;
 m := regexp_match(n,'([0-9]+)\s*(month|mth|mo)s?\y'); IF m IS NOT NULL THEN RETURN m[1]::integer; END IF;
 m := regexp_match(n,'\y(one|two|three|six|twelve)\s*(month|mth)s?\y');
 IF m IS NOT NULL THEN RETURN CASE m[1] WHEN 'one' THEN 1 WHEN 'two' THEN 2 WHEN 'three' THEN 3 WHEN 'six' THEN 6 ELSE 12 END; END IF;
 RETURN 0;
END $$;

CREATE OR REPLACE FUNCTION public.referral_reward_cutoff() RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$ SELECT '2026-10-17 19:15:00+00'::timestamptz $$;

CREATE OR REPLACE FUNCTION public.referral_reward_eligible(p_order_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private AS $$
 SELECT EXISTS(
  SELECT 1 FROM private.orders o JOIN public.order_referrals r ON r.order_id=o.id
  WHERE o.id=p_order_id AND o.created_at>=public.referral_reward_cutoff() AND o.paid_at IS NOT NULL AND o.status::text='completed'
   AND (o.customer_type='new' OR (o.customer_type='manual' AND EXISTS(SELECT 1 FROM public.order_checkout_links l WHERE l.order_id=o.id AND l.customer_kind='new')))
   AND EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND public.package_item_months(i.product_name)=12))
$$;
REVOKE ALL ON FUNCTION public.referral_reward_eligible(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_customer_subscriptions() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 WITH paid AS (
  SELECT o.*, coalesce(o.user_id,c.owner_id) AS customer_id FROM private.orders o LEFT JOIN private.app_credentials c ON c.order_id=o.id
  WHERE o.paid_at IS NOT NULL AND o.status::text<>'cancelled'
 ), customers AS (
  SELECT p.id user_id,p.username,p.display_name FROM public.profiles p
  WHERE EXISTS(SELECT 1 FROM private.app_credentials c WHERE c.owner_id=p.id) OR EXISTS(SELECT 1 FROM paid WHERE paid.customer_id=p.id)
 ), rows AS (
  SELECT cu.user_id,cu.username,cu.display_name,
   (SELECT jsonb_agg(jsonb_build_object('id',c.id,'login',c.app_login_name,'accountType',c.account_type,'accountNumber',c.account_number,'expiresAt',c.expiry_at) ORDER BY c.expiry_at NULLS LAST) FROM private.app_credentials c WHERE c.owner_id=cu.user_id) accounts,
   (SELECT string_agg(i.quantity||' × '||i.product_name,', ' ORDER BY i.id) FROM order_items i WHERE i.order_id=(SELECT id FROM paid WHERE customer_id=cu.user_id ORDER BY paid_at DESC LIMIT 1)) package,
   (SELECT max(paid_at) FROM paid WHERE customer_id=cu.user_id AND (customer_type='existing' OR EXISTS(SELECT 1 FROM order_checkout_links l WHERE l.order_id=paid.id AND l.customer_kind IN('existing','renewal')))) renewed_at,
   (SELECT min(paid_at) FROM paid WHERE customer_id=cu.user_id) first_subscription_at,
   coalesce((SELECT r.referrer_name FROM order_referrals r JOIN paid ON paid.id=r.order_id WHERE paid.customer_id=cu.user_id ORDER BY paid.created_at LIMIT 1),
    (SELECT coalesce(nullif(trim(rp.display_name),''),rp.username) FROM invites i JOIN profiles rp ON rp.id=i.created_by WHERE i.used_by=cu.user_id AND i.created_by<>cu.user_id ORDER BY i.used_at NULLS LAST,i.created_at LIMIT 1)) referrer_name,
   (SELECT jsonb_agg(jsonb_build_object('orderId',paid.id,'ref',paid.order_ref,'paidAt',paid.paid_at,'referrerId',r.referrer_user_id,'referrerName',r.referrer_name,
     'referrerAccounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'login',c.app_login_name,'expiresAt',c.expiry_at) ORDER BY c.expiry_at) FROM private.app_credentials c WHERE c.owner_id=r.referrer_user_id),'[]'::jsonb),
     'rewardedAt',w.awarded_at) ORDER BY paid.paid_at)
    FROM paid JOIN order_referrals r ON r.order_id=paid.id LEFT JOIN referral_month_rewards w ON w.order_id=paid.id
    WHERE paid.customer_id=cu.user_id AND public.referral_reward_eligible(paid.id)) rewards
  FROM customers cu
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'username',username,'displayName',display_name,'accounts',coalesce(accounts,'[]'::jsonb),'package',package,'renewedAt',renewed_at,'firstSubscriptionAt',first_subscription_at,'referrerName',referrer_name,'rewards',coalesce(rewards,'[]'::jsonb)) ORDER BY lower(coalesce(username,display_name,''))),'[]'::jsonb) INTO result FROM rows;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_customer_subscriptions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_subscriptions() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_award_referral_month(p_order_id uuid,p_credential_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE ref public.order_referrals%ROWTYPE; old_expiry timestamptz; new_expiry timestamptz;
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]) THEN RAISE EXCEPTION 'Only admin can add referral months'; END IF;
 PERFORM 1 FROM private.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT public.referral_reward_eligible(p_order_id) THEN RAISE EXCEPTION 'This sale does not qualify for a referral month'; END IF;
 IF EXISTS(SELECT 1 FROM public.referral_month_rewards WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'A free month has already been added for this sale'; END IF;
 SELECT * INTO ref FROM public.order_referrals WHERE order_id=p_order_id;
 SELECT expiry_at INTO old_expiry FROM private.app_credentials WHERE id=p_credential_id AND owner_id=ref.referrer_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of the referrer''s saved accounts'; END IF;
 new_expiry := greatest(coalesce(old_expiry,now()),now())+interval '1 month';
 UPDATE private.app_credentials SET expiry_at=new_expiry,updated_at=now() WHERE id=p_credential_id;
 INSERT INTO public.referral_month_rewards(order_id,referrer_user_id,credential_id,previous_expiry_at,new_expiry_at,awarded_by) VALUES(p_order_id,ref.referrer_user_id,p_credential_id,old_expiry,new_expiry,auth.uid());
 RETURN new_expiry;
END $$;
REVOKE ALL ON FUNCTION public.admin_award_referral_month(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_award_referral_month(uuid,uuid) TO authenticated;