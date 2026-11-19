ALTER TABLE public.player_devices ADD COLUMN IF NOT EXISTS room_name text CHECK (room_name IS NULL OR char_length(room_name) <= 40);
CREATE OR REPLACE FUNCTION public.set_player_device_room(_device_id uuid, _room text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := nullif(btrim(coalesce(_room,'')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF r IS NOT NULL AND char_length(r) > 40 THEN RAISE EXCEPTION 'Keep the room name under 40 characters'; END IF;
  UPDATE public.player_devices SET room_name = r WHERE id = _device_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Device not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_player_device_room(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_player_device_room(uuid, text) TO authenticated;