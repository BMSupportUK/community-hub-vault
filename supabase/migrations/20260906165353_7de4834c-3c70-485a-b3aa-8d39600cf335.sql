CREATE OR REPLACE FUNCTION public.fan_zone_default_avatar_url()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 'https://bmsupport.uk/__l5e/assets-v1/dada62a7-9587-4039-96aa-def92e28ceb7/boro-fan-zone-default-avatar.png'::text;
$function$;

UPDATE public.fan_zone_members
SET fan_avatar_url = NULL
WHERE fan_avatar_url = 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/avatars/defaults/boro-fan-zone.png';