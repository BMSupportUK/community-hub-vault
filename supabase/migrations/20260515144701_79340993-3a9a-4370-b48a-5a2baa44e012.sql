INSERT INTO public.page_permissions (page_key, label, allowed_roles, sort_order) VALUES
  ('leaderboard', 'Leaderboard', ARRAY['staff','moderator','member','subscriber']::app_role[], 65),
  ('reviews', 'Reviews', ARRAY['staff','moderator','member','subscriber']::app_role[], 75),
  ('staff', 'Staff directory', ARRAY['staff','moderator']::app_role[], 95),
  ('admin-reviews', 'Review moderation', ARRAY[]::app_role[], 125),
  ('admin-permissions', 'Role permissions', ARRAY[]::app_role[], 135)
ON CONFLICT (page_key) DO NOTHING;