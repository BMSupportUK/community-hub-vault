// Browser-side ESPN fallback.
//
// ESPN answers 403 "Access Denied" to our serverless egress IPs, so the
// server-rendered match detail can come back completely empty even while the
// Gamecast feed is fully populated. The visitor's own browser is not blocked and
// ESPN sends `access-control-allow-origin: *`, so when the server response is
// sparse we fetch and normalise the same feed client-side.

import { normaliseBoroMatchDetail } from "@/lib/boro-match-detail-normalise";
import type { MatchDetailDTO } from "@/lib/boro-match-detail.types";

const COMPETITIONS: Array<{ slug: string; match: RegExp }> = [
  { slug: "eng.2", match: /champ/i },
  { slug: "eng.league_cup", match: /carabao|league cup|efl cup/i },
  { slug: "eng.fa", match: /fa cup/i },
  { slug: "eng.trophy", match: /trophy/i },
  { slug: "club.friendly", match: /friendly/i },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function dateStamp(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function json<T = any>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function resolveEventId(fixture: {
  home: string;
  away: string;
  kickoff: string;
  competition?: string | null;
}): Promise<{ eventId: string; slug: string } | null> {
  const ko = Date.parse(fixture.kickoff);
  if (!Number.isFinite(ko)) return null;
  const dates = `${dateStamp(ko - 86_400_000)}-${dateStamp(ko + 86_400_000)}`;
  const preferred = COMPETITIONS.find((c) => c.match.test(fixture.competition ?? ""))?.slug;
  const slugs = preferred ? [preferred] : COMPETITIONS.map((c) => c.slug);
  const wanted = [norm(fixture.home), norm(fixture.away)];

  for (const slug of slugs) {
    const feed = await json<{ events?: any[] }>(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dates}&limit=400`,
    );
    for (const ev of feed?.events ?? []) {
      const competitors = ev?.competitions?.[0]?.competitors ?? [];
      const names: string[] = competitors.flatMap((c: any) =>
        [c?.team?.displayName, c?.team?.shortDisplayName, c?.team?.name].filter(Boolean).map(norm),
      );
      const hits = wanted.filter((w) => names.some((n) => n.includes(w) || w.includes(n)));
      if (hits.length === 2 && ev?.id) return { eventId: String(ev.id), slug };
    }
  }
  return null;
}

/** Fetch and normalise the ESPN Gamecast straight from the visitor's browser. */
export async function fetchEspnDetailInBrowser(input: {
  eventId?: string | null;
  slug?: string | null;
  fixture?: { home: string; away: string; kickoff: string; competition?: string | null } | null;
}): Promise<MatchDetailDTO | null> {
  let eventId = input.eventId ?? null;
  let slug = input.slug || "eng.2";

  if (!eventId && input.fixture) {
    const resolved = await resolveEventId(input.fixture);
    if (resolved) {
      eventId = resolved.eventId;
      slug = resolved.slug;
    }
  }
  if (!eventId) return null;

  const summary = await json(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(eventId)}`,
  );
  if (!summary) return null;

  // Hand the raw feed to our server so cron jobs (match day forum thread, live
  // block, half/full-time replies) can keep updating despite the 403 block.
  void relaySummary(eventId, slug, summary);

  try {
    return normaliseBoroMatchDetail(summary);
  } catch {
    return null;
  }
}

let lastRelayAt = 0;

async function relaySummary(eventId: string, slug: string, summary: unknown) {
  const now = Date.now();
  if (now - lastRelayAt < 10_000) return;
  lastRelayAt = now;
  try {
    await fetch("/api/public/espn-relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId, slug, summary }),
      keepalive: true,
    });
  } catch {
    /* relaying is best-effort */
  }
}
