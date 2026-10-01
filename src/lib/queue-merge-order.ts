/**
 * Orders queued posts for a merge: oldest post first, newest last. Ties
 * (parts of one split post) fall back to the part number, compared as a
 * number so part 2 comes before part 10.
 */
export type MergeOrderItem = { created_at: string; source_ref?: string | null };

function refKey(ref: string | null | undefined): { base: string; part: number } {
  const m = String(ref ?? "").match(/^(.*)#(?:part)?(\d+)$/);
  return m ? { base: m[1], part: Number(m[2]) } : { base: String(ref ?? ""), part: 0 };
}

export function sortForMerge<T extends MergeOrderItem>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (ta !== tb) return ta - tb;
    const ra = refKey(a.source_ref);
    const rb = refKey(b.source_ref);
    if (ra.base !== rb.base) return ra.base.localeCompare(rb.base);
    return ra.part - rb.part;
  });
}
