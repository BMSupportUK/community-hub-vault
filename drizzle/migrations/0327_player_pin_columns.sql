REVOKE SELECT ON public.player_pins FROM authenticated;
GRANT SELECT (id, owner_id, updated_at) ON public.player_pins TO authenticated;