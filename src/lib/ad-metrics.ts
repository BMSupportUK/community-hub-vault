import { supabase } from "@/integrations/supabase/client";

/**
 * Records advert views and clicks in our own database so the admin dashboard
 * can show per-unit impressions and clicks. Fire-and-forget: a failure here
 * must never affect the page.
 */
type Args = { kind: "impression" | "click"; slotKey: string; adSlotId: string };

/**
 * One impression per mounted advert unit: the caller stops observing after the
 * first sighting, so revisiting the same page later counts again (as it should).
 */
export async function recordAdEvent({ kind, slotKey, adSlotId }: Args) {
  if (typeof window === "undefined") return;
  const pagePath = window.location.pathname;
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
