// Server-side cache of ESPN Gamecast summaries.
//
// ESPN answers 403 "Access Denied" to our serverless egress IPs, so cron jobs
// (match day thread, live blocks, half/full-time replies) cannot read the feed
// directly. Visitors' browsers are NOT blocked, so the Fan Zone relays the raw
// summary it fetched into this cache and the server jobs read it from here.

export type CachedSummary = { eventId: string; slug: string; payload: any; updatedAt: string };

export function summaryHasCompetition(payload: any): boolean {
  return Array.isArray(payload?.header?.competitions) && payload.header.competitions.length > 0;
}

export function summaryMentionsBoro(payload: any): boolean {
  const competitors: any[] = payload?.header?.competitions?.[0]?.competitors ?? [];
  return competitors.some((c) =>
    /middlesbrough|boro/i.test(
      [c?.team?.displayName, c?.team?.name, c?.team?.shortDisplayName].filter(Boolean).join(" "),
    ),
  );
}

export async function putCachedEspnSummary(input: { eventId: string; slug: string; payload: any }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("boro_espn_summary_cache")
    .upsert(
      {
        event_id: input.eventId,
        slug: input.slug,
        payload: input.payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    );
  if (error) throw new Error(error.message);
}

export async function getCachedEspnSummary(eventId: string, maxAgeMs = 30 * 60 * 1000): Promise<any | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("boro_espn_summary_cache")
    .select("payload, updated_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!data?.payload) return null;
  const age = Date.now() - Date.parse(String(data.updated_at ?? ""));
  if (Number.isFinite(age) && age > maxAgeMs) return null;
  return data.payload as any;
}

/** Freshest relayed summary for any Boro game (used when the event id is unknown). */
export async function getLatestCachedEspnSummary(maxAgeMs = 30 * 60 * 1000): Promise<any | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("boro_espn_summary_cache")
    .select("payload, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { payload?: any; updated_at?: string } | undefined;
  if (!row?.payload) return null;
  const age = Date.now() - Date.parse(String(row.updated_at ?? ""));
  if (Number.isFinite(age) && age > maxAgeMs) return null;
  return row.payload;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Find a relayed summary that matches one of our fixtures by teams + kick-off day. */
export async function getCachedSummaryForFixture(
  fx: { home_team: string; away_team: string; kickoff_at: string },
  maxAgeMs = 6 * 60 * 60 * 1000,
): Promise<any | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("boro_espn_summary_cache")
    .select("payload, updated_at")
    .gte("updated_at", new Date(Date.now() - maxAgeMs).toISOString())
    .order("updated_at", { ascending: false })
    .limit(20);
  const wanted = [normName(fx.home_team), normName(fx.away_team)];
  const koDay = new Date(fx.kickoff_at).toISOString().slice(0, 10);
  for (const row of (data ?? []) as Array<{ payload?: any }>) {
    const comp = row.payload?.header?.competitions?.[0];
    if (!comp) continue;
    const names: string[] = (comp.competitors ?? []).flatMap((c: any) =>
      [c?.team?.displayName, c?.team?.name, c?.team?.shortDisplayName].filter(Boolean).map(normName),
    );
    const hits = wanted.filter((w) => names.some((n) => n.includes(w) || w.includes(n)));
    if (hits.length !== 2) continue;
    const date = String(comp.date ?? row.payload?.header?.competitions?.[0]?.date ?? "");
    if (date && date.slice(0, 10) !== koDay) {
      // allow a day either side for time-zone edges
      const diff = Math.abs(Date.parse(date) - Date.parse(fx.kickoff_at));
      if (!Number.isFinite(diff) || diff > 36 * 60 * 60 * 1000) continue;
    }
    return row.payload;
  }
  return null;
}
