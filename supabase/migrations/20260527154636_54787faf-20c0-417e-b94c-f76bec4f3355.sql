
-- 1. Add the new role to the enum (must be its own statement, no transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boro_fan_zone_moderator';
