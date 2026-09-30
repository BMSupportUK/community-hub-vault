ALTER TABLE public.order_checkout_links
  ADD COLUMN IF NOT EXISTS account_setup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_setup_started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.order_checkout_links.account_setup_started_at IS 'When staff moved a paid sale into the account setup stage.';
COMMENT ON COLUMN public.order_checkout_links.account_setup_started_by IS 'Staff member who moved the paid sale into account setup.';