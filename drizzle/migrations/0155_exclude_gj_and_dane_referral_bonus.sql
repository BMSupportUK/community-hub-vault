CREATE OR REPLACE FUNCTION public.referral_reward_referrer_excluded(p_referrer_user_id uuid,p_referrer_name text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(p_referrer_user_id IN ('b6ec8f38-2e2a-41ce-98fc-94681047a288'::uuid,'d4aa8456-1c83-48d9-be99-d30923284534'::uuid,'73c113ce-ce1b-43f0-af24-c2a36cf0d8e7'::uuid),false)
  OR lower(regexp_replace(coalesce(p_referrer_name,''),'[^A-Za-z0-9]','','g')) IN ('gj','gjs','gjtestaccount','dane','danej','danejsite')
$$;
REVOKE ALL ON FUNCTION public.referral_reward_referrer_excluded(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.referral_reward_referrer_excluded(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.referral_reward_eligible(p_order_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private AS $$
 SELECT EXISTS(
  SELECT 1 FROM private.orders o JOIN public.order_referrals r ON r.order_id=o.id
  WHERE o.id=p_order_id AND o.created_at>=public.referral_reward_cutoff() AND o.paid_at IS NOT NULL AND o.status::text='completed'
   AND NOT public.referral_reward_referrer_excluded(r.referrer_user_id,r.referrer_name)
   AND (o.customer_type='new' OR (o.customer_type='manual' AND EXISTS(SELECT 1 FROM public.order_checkout_links l WHERE l.order_id=o.id AND l.customer_kind='new')))
   AND EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND public.package_item_months(i.product_name)=12))
$$;
REVOKE ALL ON FUNCTION public.referral_reward_eligible(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.referral_reward_eligible(uuid) TO service_role;