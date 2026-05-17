
CREATE TYPE public.blacklist_kind AS ENUM ('email', 'ip');

CREATE TABLE public.blacklist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.blacklist_kind NOT NULL,
  value text NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX blacklist_entries_kind_value_key
  ON public.blacklist_entries (kind, lower(value));

ALTER TABLE public.blacklist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blacklist admin manage"
  ON public.blacklist_entries
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE OR REPLACE FUNCTION public.apply_blacklist_ban(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'banned'::app_role)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_blacklisted(_email text, _ip text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blacklist_entries
    WHERE (kind = 'email' AND _email IS NOT NULL AND lower(value) = lower(_email))
       OR (kind = 'ip'    AND _ip    IS NOT NULL AND lower(value) = lower(_ip))
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  new_app_id uuid;
  v_blacklisted boolean;
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  SELECT public.is_blacklisted(new.email, NULL) INTO v_blacklisted;

  IF v_blacklisted THEN
    insert into public.user_roles (user_id, role) values (new.id, 'banned');
  ELSE
    insert into public.user_roles (user_id, role) values (new.id, 'pending');
    insert into public.gate_applications (user_id) values (new.id) returning id into new_app_id;
    insert into public.gate_messages (application_id, sender_id, content)
    values (new_app_id, new.id, 'Hi! I would like to join the server.');
  END IF;

  return new;
end;
$function$;
