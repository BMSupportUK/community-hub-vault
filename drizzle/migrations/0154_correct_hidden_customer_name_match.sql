CREATE OR REPLACE FUNCTION public.admin_customer_is_hidden(p_user_id uuid,p_username text,p_display_name text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(p_user_id IN ('9521bac8-d7d3-40bd-829c-192854f3ec35'::uuid,'73c113ce-ce1b-43f0-af24-c2a36cf0d8e7'::uuid),false)
  OR lower(regexp_replace(coalesce(p_username,''),'[^A-Za-z0-9]','','g')) IN ('guest48h','guest48hsite','danej','danejsite')
  OR lower(regexp_replace(coalesce(p_display_name,''),'[^A-Za-z0-9]','','g')) IN ('guest48h','guest48hsite','danej','danejsite')
$$;
REVOKE ALL ON FUNCTION public.admin_customer_is_hidden(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_is_hidden(uuid,text,text) TO authenticated,service_role;