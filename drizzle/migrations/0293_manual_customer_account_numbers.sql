ALTER TABLE public.player_offsite_customers ADD COLUMN IF NOT EXISTS manual_customer_id uuid UNIQUE;

CREATE OR REPLACE FUNCTION private.is_manual_customer_id(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _id) AND (
    EXISTS (SELECT 1 FROM public.manual_name_customers n WHERE n.id = _id)
    OR EXISTS (SELECT 1 FROM private.orders o WHERE o.id = _id AND o.paid_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.order_checkout_links l WHERE l.renewal_customer_id = _id))
$$;

CREATE OR REPLACE FUNCTION public.admin_ensure_customer_number(_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN RETURN NULL; END IF;
  IF NOT private.is_manual_customer_id(_id) THEN
    RETURN (SELECT number FROM public.customer_numbers WHERE user_id = _id);
  END IF;
  RETURN public.assign_customer_number(_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_ensure_customer_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ensure_customer_number(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.manual_name_customer_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.assign_customer_number(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS manual_name_customer_number ON public.manual_name_customers;
CREATE TRIGGER manual_name_customer_number AFTER INSERT ON public.manual_name_customers
FOR EACH ROW EXECUTE FUNCTION public.manual_name_customer_number();

CREATE OR REPLACE FUNCTION public.issue_manual_player_customer(_manual uuid, _name text, _email text, _username text, _expires timestamptz, _admin uuid)
RETURNS TABLE(id uuid, number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; new_id uuid;
BEGIN
  IF NOT private.is_manual_customer_id(_manual) THEN RAISE EXCEPTION 'Not a manual customer'; END IF;
  n := public.assign_customer_number(_manual);
  INSERT INTO player_offsite_customers(customer_name, email, number, iptv_username, expires_at, created_by, manual_customer_id)
  VALUES (btrim(_name), lower(btrim(coalesce(_email,''))), n, btrim(_username), _expires, _admin, _manual)
  ON CONFLICT (manual_customer_id) DO UPDATE SET iptv_username = EXCLUDED.iptv_username, expires_at = EXCLUDED.expires_at,
    email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE player_offsite_customers.email END
  RETURNING player_offsite_customers.id INTO new_id;
  id := new_id; number := n; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.issue_manual_player_customer(uuid,text,text,text,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_manual_player_customer(uuid,text,text,text,timestamptz,uuid) TO service_role;

SELECT public.assign_customer_number(n.id) FROM public.manual_name_customers n
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = n.id);
SELECT public.assign_customer_number(x.cid) FROM (
  SELECT DISTINCT coalesce(l.renewal_customer_id, o.id) cid FROM private.orders o
  LEFT JOIN public.order_checkout_links l ON l.order_id = o.id
  WHERE o.paid_at IS NOT NULL AND o.status::text <> 'cancelled' AND (o.customer_type = 'manual' OR o.order_ref LIKE 'MANUAL-%')) x
WHERE x.cid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.cid);