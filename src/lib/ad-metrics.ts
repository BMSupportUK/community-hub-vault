import { supabase } from "@/integrations/supabase/client";

/**
 * Records advert views and clicks in our own database so the admin dashboard
 * can show per-unit impressions and clicks. Fire-and-forget: a failure here
 * must never affect the page.
 */
const seen = new Set<string>();

type Args = { kind: "impression" | "click"; slotKey: string; adSlotId: string };

export async function recordAdEvent({ kind, slotKey, adSlotId }: Args) {
  if (typeof window === "undefined") return;
  const pagePath = window.location.pathname;
  if (kind === "impression") {
    const key = `${slotKey}|${adSlotId}|${pagePath}`;
    if (seen.has(key)) return; // one impression per slot per page view
    seen.add(key);
  }
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from("ad_events").insert({
      kind,
      slot_key: slotKey,
      ad_slot_id: adSlotId,
      page_path: pagePath.slice(0, 200),
      user_id: data.session?.user.id ?? null,
    });
  } catch {
    // ignore — advert stats are best effort
  }
}
