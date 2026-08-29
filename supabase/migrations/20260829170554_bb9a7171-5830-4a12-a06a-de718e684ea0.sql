ALTER TABLE public.shift_slots REPLICA IDENTITY FULL;
ALTER TABLE public.holiday_requests REPLICA IDENTITY FULL;
ALTER TABLE public.shift_swap_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.holiday_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_swap_requests;