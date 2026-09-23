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
    .select("id, body, updated_at, created_at")
    .not("body", "is", null);
  if (error || !data) return { cleared: 0, skipped: false };

  let cleared = 0;
  for (const row of data as { id: string; body: string | null; updated_at: string | null; created_at: string | null }[]) {
    const stamp = row.updated_at ?? row.created_at;
    const fallback = stamp ? Date.parse(stamp) : null;
    const next = pruneStaleSportsListingHtml(row.body, now, Number.isFinite(fallback) ? fallback : null);
    if (next === null) continue;
    // Auto-clear is housekeeping, not an edit — keep updated_at so the guide
    // doesn't suddenly reappear as unread.
    const { error: upErr } = await supabaseAdmin.rpc("prune_sports_blog_body", { _id: row.id, _body: next });
    if (!upErr) cleared += 1;
  }
  return { cleared, skipped: false };
});
