-- Add an "Orders" ticket category and restrict it to admin/management only
INSERT INTO public.ticket_categories (name, slug, description, icon, color, sort_order)
VALUES ('Orders', 'orders', 'Tickets automatically opened for shop orders. Admin and management only.', 'ShoppingBag', 'warning', -10)
ON CONFLICT (slug) DO NOTHING;

-- Extend the access helper so the Orders category gets the same
-- admin/management-only treatment as Owner & Management.
-- (Existing tickets RLS + auto-assign already use this function.)
CREATE OR REPLACE FUNCTION public.is_owner_management_category(_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ticket_categories
    WHERE id = _category_id AND slug IN ('owner-management', 'orders')
  )
$function$;