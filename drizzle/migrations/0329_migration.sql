ALTER TABLE public.player_totp DROP CONSTRAINT player_totp_pkey;
ALTER TABLE public.player_totp ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY;
ALTER TABLE public.player_totp ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.player_totp ADD CONSTRAINT player_totp_owner_key UNIQUE (owner_id);
ALTER TABLE public.player_totp ADD COLUMN offsite_customer_id uuid UNIQUE;
ALTER TABLE public.player_totp ADD CONSTRAINT player_totp_one_owner CHECK ((owner_id IS NOT NULL) <> (offsite_customer_id IS NOT NULL));