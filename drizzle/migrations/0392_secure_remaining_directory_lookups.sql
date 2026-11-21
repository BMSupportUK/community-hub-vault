CREATE OR REPLACE FUNCTION public.directory_member_roles()
RETURNS TABLE(user_id uuid, role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
 SELECT ur.user_id, ur.role::text FROM public.user_roles ur
 WHERE public.caller_is_approved_member_or_staff()
 AND NOT EXISTS (SELECT 1 FROM public.user_roles s WHERE s.user_id=ur.user_id AND s.role IN ('admin','management','moderator','staff','pending','banned','rejected'));
$$;
REVOKE EXECUTE ON FUNCTION public.directory_member_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_member_roles() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.forum_reported_posts(_ids uuid[])
RETURNS TABLE(target_id uuid, report_count integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
 SELECT cr.target_id,count(*)::int FROM public.content_reports cr
 WHERE public.caller_is_staff_or_fan_zone() AND cr.kind='forum_post' AND cr.status='pending' AND cr.target_id=ANY(_ids) GROUP BY cr.target_id;
$$;
REVOKE EXECUTE ON FUNCTION public.forum_reported_posts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forum_reported_posts(uuid[]) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.fan_zone_hide_friends(_ids uuid[])
RETURNS TABLE(user_id uuid, hide_friends boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
 SELECT m.user_id,m.hide_friends FROM public.fan_zone_members m
 WHERE public.caller_is_staff_or_fan_zone() AND m.user_id=ANY(_ids);
$$;
REVOKE EXECUTE ON FUNCTION public.fan_zone_hide_friends(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fan_zone_hide_friends(uuid[]) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_invite_leaderboard()
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, used_count bigint, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
 SELECT p.id,p.display_name,p.username,p.avatar_url,
 COUNT(*) FILTER (WHERE i.used_by IS NOT NULL)::bigint,COUNT(*)::bigint
 FROM public.invites i JOIN public.profiles p ON p.id=i.created_by
 WHERE public.caller_is_approved_member_or_staff()
 GROUP BY p.id,p.display_name,p.username,p.avatar_url
 ORDER BY COUNT(*) FILTER (WHERE i.used_by IS NOT NULL) DESC,COUNT(*) DESC LIMIT 100;
$$;
REVOKE EXECUTE ON FUNCTION public.get_invite_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invite_leaderboard() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.checkout_app_login(p_token text, p_password text)
RETURNS TABLE(app_login_name text,password text,account_type text,expiry_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO private, public, extensions, pg_catalog AS $$
DECLARE v_order_id uuid; v_link_pw text; v_setup timestamptz; v_user uuid; v_paid timestamptz; v_status text;
BEGIN
 SELECT l.order_id,l.password,l.account_setup_at INTO v_order_id,v_link_pw,v_setup FROM public.order_checkout_links l WHERE l.token=p_token LIMIT 1;
 IF v_order_id IS NULL OR nullif(trim(v_link_pw),'') IS NULL OR nullif(trim(p_password),'') IS NULL
 OR upper(trim(p_password)) <> upper(trim(v_link_pw)) THEN RETURN; END IF;
 IF v_setup IS NULL THEN RETURN; END IF;
 SELECT o.user_id,o.paid_at,o.status::text INTO v_user,v_paid,v_status FROM private.orders o WHERE o.id=v_order_id;
 IF v_user IS NULL OR v_paid IS NULL OR coalesce(v_status,'')='cancelled' THEN RETURN; END IF;
 RETURN QUERY SELECT c.app_login_name,private.app_decrypt(c.password_enc),c.account_type,c.expiry_at
 FROM private.app_credentials c WHERE c.owner_id=v_user AND c.order_id=v_order_id
 AND coalesce(c.app_login_name,'')<>'' AND c.password_enc IS NOT NULL ORDER BY c.account_number NULLS LAST;
END; $$;
REVOKE EXECUTE ON FUNCTION public.checkout_app_login(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_app_login(text,text) TO anon, authenticated, service_role;