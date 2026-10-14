CREATE TABLE public.staff_records (
 user_id uuid PRIMARY KEY,
 join_date date,
 leave_date date,
 roles text[] NOT NULL DEFAULT '{}',
 username text,
 display_name text,
 avatar_url text,
 bio text,
 equipped_nameplate_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT staff_record_dates CHECK (leave_date IS NULL OR (join_date IS NOT NULL AND leave_date >= join_date))
);
GRANT SELECT ON public.staff_records TO authenticated;
GRANT ALL ON public.staff_records TO service_role;
ALTER TABLE public.staff_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in directory employment dates" ON public.staff_records FOR SELECT TO authenticated USING (true);
INSERT INTO public.staff_records (user_id, roles, username, display_name, avatar_url, bio, equipped_nameplate_id)
SELECT p.id, array_agg(r.role::text ORDER BY r.role::text), p.username, p.display_name, p.avatar_url, p.bio, p.equipped_nameplate_id FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE r.role::text IN ('admin','management','staff','moderator') GROUP BY p.id;
CREATE OR REPLACE FUNCTION public.save_staff_record(_user_id uuid, _join_date date, _leave_date date DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE current_roles text[]; old_record public.staff_records; target_profile public.profiles;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Owners only'; END IF;
 IF _join_date IS NULL THEN RAISE EXCEPTION 'Enter the date joined'; END IF;
 IF _leave_date IS NOT NULL AND _leave_date < _join_date THEN RAISE EXCEPTION 'Date left cannot be before date joined'; END IF;
 IF _leave_date > (now() AT TIME ZONE 'Europe/London')::date THEN RAISE EXCEPTION 'Date left cannot be in the future'; END IF;
 IF _user_id=auth.uid() AND _leave_date IS NOT NULL THEN RAISE EXCEPTION 'You cannot mark yourself as having left'; END IF;
 SELECT * INTO old_record FROM public.staff_records WHERE user_id=_user_id FOR UPDATE;
 SELECT array_agg(role::text ORDER BY role::text) INTO current_roles FROM public.user_roles WHERE user_id=_user_id AND role::text IN ('admin','management','staff','moderator');
 IF current_roles IS NULL AND old_record.user_id IS NULL THEN RAISE EXCEPTION 'This account is not staff'; END IF;
 IF old_record.leave_date IS NOT NULL AND _leave_date IS NULL AND current_roles IS NULL THEN RAISE EXCEPTION 'Assign a staff role before recording a return'; END IF;
 SELECT * INTO target_profile FROM public.profiles WHERE id=_user_id;
 INSERT INTO public.staff_records(user_id,join_date,leave_date,roles,username,display_name,avatar_url,bio,equipped_nameplate_id)
 VALUES (_user_id,_join_date,_leave_date,coalesce(current_roles,old_record.roles),coalesce(target_profile.username,old_record.username),coalesce(target_profile.display_name,old_record.display_name),coalesce(target_profile.avatar_url,old_record.avatar_url),coalesce(target_profile.bio,old_record.bio),coalesce(target_profile.equipped_nameplate_id,old_record.equipped_nameplate_id))
 ON CONFLICT(user_id) DO UPDATE SET join_date=excluded.join_date, leave_date=excluded.leave_date, roles=excluded.roles, username=excluded.username, display_name=excluded.display_name, avatar_url=excluded.avatar_url, bio=excluded.bio, equipped_nameplate_id=excluded.equipped_nameplate_id, updated_at=now();
 IF _leave_date IS NOT NULL THEN DELETE FROM public.user_roles WHERE user_id=_user_id AND role::text IN ('admin','management','staff','moderator'); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.save_staff_record(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_staff_record(uuid,date,date) TO authenticated, service_role;
COMMENT ON TABLE public.staff_records IS 'Employment dates and non-sensitive directory snapshots retained after staff roles or accounts are removed. Unknown join dates remain null until confirmed by the owner.';