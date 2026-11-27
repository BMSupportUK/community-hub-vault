CREATE OR REPLACE FUNCTION public.referral_reward_eligible(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
 SELECT EXISTS(
  SELECT 1 FROM private.orders o JOIN public.order_referrals r ON r.order_id=o.id
  WHERE o.id=p_order_id AND o.created_at>=public.referral_reward_cutoff() AND o.created_at < timestamptz '2026-11-27 00:00:00+00'
   AND o.paid_at IS NOT NULL AND o.status::text='completed'
   AND NOT public.referral_reward_referrer_excluded(r.referrer_user_id,r.referrer_name)
   AND (o.customer_type='new' OR (o.customer_type='manual' AND EXISTS(SELECT 1 FROM public.order_checkout_links l WHERE l.order_id=o.id AND l.customer_kind='new')))
   AND EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND public.package_item_months(i.product_name)=12))
$function$;