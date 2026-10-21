-- Make the customer portal login code email editable from the admin dashboard.
-- The designed HTML template stays as the fallback until the admin writes their own.
INSERT INTO public.automated_messages (key, label, description, category, channel, subject, body, placeholders, sort_order)
VALUES (
  'email:customer-portal-link',
  'Customer portal login code',
  'Email containing the portal login code a customer needs to unlock their Customer Portal.',
  'Emails',
  'email',
  'Your BM Support portal login code',
  '',
  ARRAY['name','loginCode'],
  390
)
ON CONFLICT (key) DO NOTHING;