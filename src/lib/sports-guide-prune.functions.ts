import { createServerFn } from "@tanstack/react-start";
import { pruneStaleSportsListingHtml } from "./sports-listing-format";

// Sweep at most this often, however many people open the guides page.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweepAt = 0;

/**
 * Clears guide entries 10 hours after their start time so yesterday's
 * listings disappear on their own, with no editor tidying up by hand.
 */
export const pruneStaleSportsGuides = createServerFn({ method: "POST" }).handler(async () => {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return { cleared: 0, skipped: true };
  lastSweepAt = now;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("sports_blogs")
    .select("id, body")
    .not("body", "is", null);
  if (error || !data) return { cleared: 0, skipped: false };

  let cleared = 0;
  for (const row of data as { id: string; body: string | null }[]) {
    const next = pruneStaleSportsListingHtml(row.body, now);
    if (next === null) continue;
    const { error: upErr } = await supabaseAdmin
      .from("sports_blogs")
      .update({ body: next })
      .eq("id", row.id);
    if (!upErr) cleared += 1;
  }
  return { cleared, skipped: false };
});
