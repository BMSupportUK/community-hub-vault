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
    .select("order_id,password,customer_kind,claimed_by,payment_sent_at,account_setup_started_at,account_setup_at,qd_code_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return null;
  // Only manual orders are password-gated. Shop-order links are created with
  // claimed_by set (the placing member), so a null claimed_by means manual.
  if (!link.claimed_by) {
    // Always run a comparison so a wrong token and a wrong password look the same.
    if (!same(password, link.password)) return null;
  }
  return { supabaseAdmin, link };
}

