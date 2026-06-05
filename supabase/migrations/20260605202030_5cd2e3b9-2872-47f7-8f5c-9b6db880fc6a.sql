
-- 1) Add new enum value (idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boro_fan_zone_member';
