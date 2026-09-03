UPDATE public.page_permissions
SET allowed_roles = ARRAY['admin','management']::app_role[]
WHERE allowed_roles IS NULL OR cardinality(allowed_roles) = 0;

UPDATE public.page_permissions
SET allowed_roles = ARRAY['admin','management','boro_fan_zone_moderator']::app_role[]
WHERE page_key = 'admin-fan-zone';