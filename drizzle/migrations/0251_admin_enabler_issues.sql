CREATE TABLE public.admin_enabler_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  device text NOT NULL CHECK (device IN ('amazon','android')),
  purpose text NOT NULL CHECK (purpose IN ('install','support')),
  issued_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX admin_enabler_issues_created_idx ON public.admin_enabler_issues (created_at DESC);
GRANT ALL ON public.admin_enabler_issues TO service_role;
ALTER TABLE public.admin_enabler_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enabler_handoffs ADD COLUMN admin_issue_id uuid REFERENCES public.admin_enabler_issues(id) ON DELETE SET NULL;
ALTER TABLE public.enabler_login_pins ADD COLUMN admin_issue_id uuid REFERENCES public.admin_enabler_issues(id) ON DELETE SET NULL;
CREATE INDEX enabler_handoffs_admin_issue_idx ON public.enabler_handoffs (admin_issue_id);
CREATE INDEX enabler_login_pins_admin_issue_idx ON public.enabler_login_pins (admin_issue_id);