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
  // Always run a comparison so a wrong token and a wrong password look the same.
  const ok = same(password, link?.password ?? "____-____-____") && !!link;
  if (!ok || !link) return null;
  return { supabaseAdmin, link };
}

