
-- 1. Storage: remove broad public SELECT policies (CDN still serves /object/public/* files)
drop policy if exists "avatars public read" on storage.objects;
drop policy if exists "status attachments public read" on storage.objects;
drop policy if exists "Hero box icons are publicly readable" on storage.objects;
drop policy if exists "Sports guide covers are publicly viewable" on storage.objects;

-- 2. SECURITY DEFINER functions: revoke from anon + public, grant only where needed

-- Trigger functions (fire from the database, no direct EXECUTE needed)
revoke execute on function public.tg_orders_iud()                         from public, anon, authenticated;
revoke execute on function public.tg_gate_messages_iud()                  from public, anon, authenticated;
revoke execute on function public.tg_user_ip_logs_iud()                   from public, anon, authenticated;
revoke execute on function public.tg_app_credentials_iud()                from public, anon, authenticated;
revoke execute on function public.validate_mention_permissions()          from public, anon, authenticated;
revoke execute on function public.process_chat_mentions()                 from public, anon, authenticated;
revoke execute on function public.process_ticket_mentions()               from public, anon, authenticated;
revoke execute on function public.notify_new_swap_request()               from public, anon, authenticated;
revoke execute on function public.notify_new_holiday_request()            from public, anon, authenticated;
revoke execute on function public.seed_channel_permissions()              from public, anon, authenticated;
revoke execute on function public.enforce_slow_mode()                     from public, anon, authenticated;
revoke execute on function public.grant_subscriber_on_completed_order()   from public, anon, authenticated;
revoke execute on function public.prevent_ignore_staff()                  from public, anon, authenticated;

-- Encryption helper: only the database (called by triggers); never from clients
revoke execute on function public.app_encrypt(text) from public, anon, authenticated;

-- RLS helpers: needed by authenticated requests evaluating policies
revoke execute on function public.has_role(uuid, app_role)                  from public, anon;
revoke execute on function public.has_any_role(uuid, app_role[])            from public, anon;
revoke execute on function public.can_in_channel(uuid, uuid, text)          from public, anon;
grant  execute on function public.has_role(uuid, app_role)                  to authenticated;
grant  execute on function public.has_any_role(uuid, app_role[])            to authenticated;
grant  execute on function public.can_in_channel(uuid, uuid, text)          to authenticated;

-- App RPCs: signed-in users only
revoke execute on function public.redeem_invite(text)              from public, anon;
revoke execute on function public.submit_appeal(text)              from public, anon;
revoke execute on function public.create_app_role(text, text)      from public, anon;
revoke execute on function public.delete_app_role(text)            from public, anon;
revoke execute on function public.cleanup_old_chat_messages()      from public, anon;
revoke execute on function public.get_invite_leaderboard()         from public, anon;
grant  execute on function public.redeem_invite(text)              to authenticated;
grant  execute on function public.submit_appeal(text)              to authenticated;
grant  execute on function public.create_app_role(text, text)      to authenticated;
grant  execute on function public.delete_app_role(text)            to authenticated;
grant  execute on function public.cleanup_old_chat_messages()      to authenticated;
grant  execute on function public.get_invite_leaderboard()         to authenticated;
