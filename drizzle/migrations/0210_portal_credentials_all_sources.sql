CREATE OR REPLACE FUNCTION public.portal_credentials_for_user(p_user_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.sort DESC),'[]'::jsonb) FROM (
    SELECT jsonb_build_object('id',o.id,'name',o.shipping_name,'login',coalesce(pc.app_login_name,cr.app_login_name),'password',private.app_decrypt(coalesce(pc.password_enc,cr.password_enc)),'expiresAt',coalesce(l.subscription_expiry_at,pc.expiry_at,cr.expiry_at),'accountType',coalesce(pc.account_type,cr.account_type,'single')) j, o.created_at sort
    FROM private.orders o LEFT JOIN public.order_checkout_links l ON l.order_id=o.id LEFT JOIN private.pending_order_credentials pc ON pc.order_id=o.id
    LEFT JOIN LATERAL (SELECT * FROM private.app_credentials c WHERE c.order_id=o.id ORDER BY c.created_at DESC LIMIT 1) cr ON true
    WHERE o.user_id=p_user_id AND o.paid_at IS NOT NULL AND o.status::text<>'cancelled' AND coalesce(pc.app_login_name,cr.app_login_name) IS NOT NULL
    UNION ALL
    SELECT jsonb_build_object('id',c.id,'name',null,'login',c.app_login_name,'password',private.app_decrypt(c.password_enc),'expiresAt',c.expiry_at,'accountType',c.account_type), c.created_at
    FROM private.app_credentials c WHERE c.owner_id=p_user_id
  ) x;
$function$;