INSERT INTO public.nameplates (id, name, description, image_url, is_active, is_free, sort_order) VALUES
 ('a1f0c001-0000-4000-8000-000000000001','Staff Team','Default name plate for BM Support staff','https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v3/staff-team.jpg',true,false,10),
 ('a1f0c001-0000-4000-8000-000000000002','Moderator Team','Default name plate for BM Support moderators','https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v3/moderator-team.jpg',true,false,11),
 ('a1f0c001-0000-4000-8000-000000000003','Management Team','Default name plate for BM Support management','https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v3/management-team.jpg',true,false,12)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.staff_nameplate_for_role(_role app_role)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role
    WHEN 'staff' THEN 'a1f0c001-0000-4000-8000-000000000001'::uuid
    WHEN 'moderator' THEN 'a1f0c001-0000-4000-8000-000000000002'::uuid
    WHEN 'management' THEN 'a1f0c001-0000-4000-8000-000000000003'::uuid
    WHEN 'admin' THEN 'a1f0c001-0000-4000-8000-000000000003'::uuid
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.sync_staff_nameplates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE np uuid; uid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    uid := NEW.user_id; np := staff_nameplate_for_role(NEW.role);
    IF np IS NOT NULL THEN
      INSERT INTO user_nameplates (user_id, nameplate_id)
        SELECT uid, np WHERE NOT EXISTS (SELECT 1 FROM user_nameplates WHERE user_id = uid AND nameplate_id = np);
      UPDATE profiles SET equipped_nameplate_id = np WHERE id = uid AND equipped_nameplate_id IS NULL;
    END IF;
    RETURN NEW;
  ELSE
    uid := OLD.user_id; np := staff_nameplate_for_role(OLD.role);
    IF np IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = uid AND staff_nameplate_for_role(role) = np
    ) THEN
      DELETE FROM user_nameplates WHERE user_id = uid AND nameplate_id = np;
      UPDATE profiles SET equipped_nameplate_id = NULL WHERE id = uid AND equipped_nameplate_id = np;
    END IF;
    RETURN OLD;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_staff_nameplates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_staff_nameplates ON public.user_roles;
CREATE TRIGGER trg_sync_staff_nameplates AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_nameplates();

-- Backfill existing staff
INSERT INTO public.user_nameplates (user_id, nameplate_id)
SELECT DISTINCT r.user_id, public.staff_nameplate_for_role(r.role)
FROM public.user_roles r
WHERE public.staff_nameplate_for_role(r.role) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_nameplates u WHERE u.user_id = r.user_id AND u.nameplate_id = public.staff_nameplate_for_role(r.role));

UPDATE public.profiles p SET equipped_nameplate_id = x.np
FROM (
  SELECT DISTINCT ON (user_id) user_id, public.staff_nameplate_for_role(role) np
  FROM public.user_roles WHERE public.staff_nameplate_for_role(role) IS NOT NULL
  ORDER BY user_id, CASE role WHEN 'admin' THEN 0 WHEN 'management' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END
) x
WHERE p.id = x.user_id AND p.equipped_nameplate_id IS NULL;