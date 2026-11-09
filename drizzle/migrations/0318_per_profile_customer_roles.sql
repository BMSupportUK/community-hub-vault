CREATE TABLE public.profile_roles (
  credential_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (credential_id, role),
  CONSTRAINT profile_roles_customer_only CHECK (role::text IN ('member','subscriber','nonsubscriber'))
);
GRANT ALL ON public.profile_roles TO service_role;
ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_profile_roles(p_owner uuid)
RETURNS TABLE(credential_id uuid, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','private'
AS $$ BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT r.credential_id, r.role::text FROM public.profile_roles r
    JOIN private.app_credentials c ON c.id=r.credential_id WHERE c.owner_id=p_owner;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_roles(p_credential uuid, p_roles text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private'
AS $$ BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.app_credentials WHERE id=p_credential) THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_roles) x WHERE x NOT IN ('member','subscriber','nonsubscriber')) THEN RAISE EXCEPTION 'Only customer roles can be set on a profile'; END IF;
  DELETE FROM public.profile_roles WHERE credential_id=p_credential;
  INSERT INTO public.profile_roles(credential_id, role) SELECT p_credential, x::public.app_role FROM unnest(p_roles) x;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_profile_roles(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_roles(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_profile_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_roles(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_profile_access()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE s public.profile_session_access; rs jsonb; staff boolean; custom boolean; BEGIN
 SELECT * INTO s FROM public.profile_session_access WHERE session_id=public.profile_auth_session_id() AND user_id=auth.uid();
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','management','staff','moderator')) INTO staff;
 custom := COALESCE(s.restricted,false) AND EXISTS(SELECT 1 FROM public.profile_roles WHERE credential_id=s.credential_id);
 SELECT COALESCE(jsonb_agg(role::text),'[]'::jsonb) INTO rs FROM public.user_roles WHERE user_id=auth.uid()
   AND (NOT COALESCE(s.restricted,false) OR role::text NOT IN ('admin','management','staff','moderator','boro_fan_zone_moderator'))
   AND (NOT custom OR role::text NOT IN ('member','subscriber','nonsubscriber'));
 IF custom THEN
   rs := rs || (SELECT jsonb_agg(role::text) FROM public.profile_roles WHERE credential_id=s.credential_id);
 ELSIF COALESCE(s.restricted,false) AND staff THEN rs=rs || '["subscriber"]'::jsonb; END IF;
 RETURN jsonb_build_object('profileId',s.credential_id,'restricted',COALESCE(s.restricted,false),'canUseStaff',staff,'roles',rs);
END $function$;