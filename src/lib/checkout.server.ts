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
    .select("order_id,password,customer_kind")
    .eq("token", token)
    .maybeSingle();
  if (!link) return null;
  // Only manual orders (which set customer_kind) are password-gated. Shop
  // orders unlock with the unguessable token alone.
  if (link.customer_kind) {
    // Always run a comparison so a wrong token and a wrong password look the same.
    if (!same(password, link.password)) return null;
  }
  return { supabaseAdmin, link };
}

