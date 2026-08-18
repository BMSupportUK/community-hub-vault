ALTER TABLE private.app_credentials
  ADD COLUMN IF NOT EXISTS account_number integer;

WITH numbered AS (
  SELECT id,
         row_number() OVER (PARTITION BY owner_id ORDER BY created_at ASC, id ASC)::integer AS account_number
  FROM private.app_credentials
)
UPDATE private.app_credentials AS credentials
SET account_number = numbered.account_number
FROM numbered
WHERE credentials.id = numbered.id
  AND credentials.account_number IS NULL;

ALTER TABLE private.app_credentials
  ALTER COLUMN account_number SET NOT NULL;

ALTER TABLE private.app_credentials
  DROP CONSTRAINT IF EXISTS app_credentials_owner_account_number_key;
ALTER TABLE private.app_credentials
  ADD CONSTRAINT app_credentials_owner_account_number_key UNIQUE (owner_id, account_number);

CREATE OR REPLACE VIEW public.app_credentials AS
 SELECT id,
    owner_id,
    app_login_name,
    expiry_at,
        CASE
            WHEN owner_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'management'::public.app_role]) THEN private.app_decrypt(password_enc)
            ELSE NULL::text
        END AS password,
        CASE
            WHEN owner_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'management'::public.app_role]) THEN private.app_decrypt(notes_enc)
            ELSE NULL::text
        END AS notes,
    created_at,
    updated_at,
    created_by,
    account_type,
    account_number
   FROM private.app_credentials;

CREATE OR REPLACE FUNCTION public.tg_app_credentials_iud()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_catalog
AS $$
declare
  v_id uuid;
  v_account_number integer;
begin
  if not public.has_any_role(auth.uid(), array['admin','management']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if (tg_op = 'INSERT') then
    v_id := coalesce(new.id, gen_random_uuid());
    perform pg_advisory_xact_lock(hashtext(new.owner_id::text));
    select coalesce(max(account_number), 0) + 1
      into v_account_number
      from private.app_credentials
      where owner_id = new.owner_id;
    insert into private.app_credentials
      (id, owner_id, app_login_name, account_type, account_number, password_enc, notes_enc, expiry_at, created_by, created_at, updated_at)
    values (v_id, new.owner_id, new.app_login_name, coalesce(new.account_type, 'single'), v_account_number,
            public.app_encrypt(new.password), public.app_encrypt(new.notes),
            new.expiry_at, coalesce(new.created_by, auth.uid()), now(), now());
    new.id := v_id;
    new.account_number := v_account_number;
    new.created_at := now();
    new.updated_at := now();
    return new;
  elsif (tg_op = 'UPDATE') then
    update private.app_credentials set
      owner_id = new.owner_id,
      app_login_name = new.app_login_name,
      account_type = coalesce(new.account_type, account_type),
      password_enc = case when new.password is distinct from old.password
                          then public.app_encrypt(new.password) else password_enc end,
      notes_enc    = case when new.notes is distinct from old.notes
                          then public.app_encrypt(new.notes) else notes_enc end,
      expiry_at = new.expiry_at,
      updated_at = now()
    where id = old.id;
    new.account_number := old.account_number;
    new.updated_at := now();
    return new;
  elsif (tg_op = 'DELETE') then
    delete from private.app_credentials where id = old.id;
    return old;
  end if;
  return null;
end $$;