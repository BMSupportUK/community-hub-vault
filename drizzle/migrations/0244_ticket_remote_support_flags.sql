ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS remote_support boolean NOT NULL DEFAULT true;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS remote_setup_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.finish_ticket_remote_setup(_ticket_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.tickets SET remote_setup_pending = false, updated_at = now()
   WHERE id = _ticket_id AND user_id = auth.uid() AND remote_setup_pending;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.finish_ticket_remote_setup(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finish_ticket_remote_setup(uuid) TO authenticated;