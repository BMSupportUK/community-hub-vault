import { createHash, timingSafeEqual } from "crypto";

function same(a: string, b: string) {
  const x = createHash("sha256").update(a.trim().toUpperCase()).digest();
  const y = createHash("sha256").update(b.trim().toUpperCase()).digest();
  return timingSafeEqual(x, y);
}

export async function unlock(token: string, password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin
    .from("order_checkout_links")
    .select("order_id,password,customer_kind,claimed_by,payment_sent_at,account_setup_started_at,account_setup_at,qd_code_id,skip_registration")
    .eq("token", token)
    .maybeSingle();
  if (!link) return null;
  // Every customer order requires its password, including claimed shop orders.
  if (!password.trim() || !same(password, link.password)) return null;
  return { supabaseAdmin, link };
}

