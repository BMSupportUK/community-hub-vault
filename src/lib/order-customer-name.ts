import { supabase } from "@/integrations/supabase/client";

export { orderCustomerName } from './order-customer-label';

/** Site usernames for order owners, keyed by user id. */
export async function fetchOrderUserNames(userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const names: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("profiles").select("id, display_name, username").in("id", ids.slice(i, i + 200));
    for (const p of data ?? []) {
      const n = p.display_name || p.username;
      if (n) names[p.id] = n;
    }
  }
  return names;
}

