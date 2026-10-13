UPDATE public.temporary_accounts SET expires_at = '2099-12-31 23:59:59+00' WHERE user_id = '9521bac8-d7d3-40bd-829c-192854f3ec35';

CREATE OR REPLACE FUNCTION public.refresh_demo_account_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  UPDATE public.temporary_accounts SET expires_at = '2099-12-31 23:59:59+00'
   WHERE user_id = '9521bac8-d7d3-40bd-829c-192854f3ec35';
  UPDATE private.app_credentials SET expiry_at = now() + interval '30 days', updated_at = now()
   WHERE owner_id = '9521bac8-d7d3-40bd-829c-192854f3ec35'
     AND expiry_at < now() + interval '7 days';
END $$;
REVOKE ALL ON FUNCTION public.refresh_demo_account_data() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('refresh-demo-account-data', '10 * * * *', $$SELECT public.refresh_demo_account_data();$$);