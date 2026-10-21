import { supabase } from "@/integrations/supabase/client";

type NamedOrder = { user_id?: string | null; shipping_name?: string | null; existing_username?: string | null };

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

/** Orders show the buyer's site username first; the typed checkout name is only a fallback. */
export function orderCustomerName(order: NamedOrder, names: Record<string, string>) {
  return (order.user_id && names[order.user_id]) || order.shipping_name || order.existing_username || "—";
}
