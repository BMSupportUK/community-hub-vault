// Posts live match events (goals + scorer, yellow/red cards, penalties and
// substitutions) into the Middlesbrough match day forum thread as replies, and
// posts an updated reply whenever ESPN corrects an event it already reported.

import { matchTopicToFixture, type FixtureLite } from "@/lib/boro-team-sheet.server";

const SLUGS = ["eng.2", "eng.fa", "eng.league_cup", "eng.efl_cup", "eng.trophy", "eng.efl_trophy"];
const BORO_RE = /\bmiddles(?:brough|borough)\b|\bboro\b/i;

const WINDOW_BEFORE_MS = 30 * 60 * 1000; // start watching 30m before KO
const WINDOW_AFTER_MS = 4 * 60 * 60 * 1000; // keep watching 4h after KO

type ParsedEvent = {
  key: string;
  kind: "goal" | "own-goal" | "penalty" | "penalty-missed" | "red" | "yellow" | "sub" | "other";
  clock: string | null;
  team: string | null;
  players: string[];
  text: string;
  homeScore: number | null;
  awayScore: number | null;
};

function classify(d: any): ParsedEvent["kind"] {
  const text = String(d?.type?.text ?? "").toLowerCase();
  if (d?.ownGoal) return "own-goal";
  if (d?.penaltyKick && d?.scoringPlay) return "penalty";
  if (d?.penaltyKick && !d?.scoringPlay) return "penalty-missed";
  if (d?.scoringPlay || text.includes("goal")) return "goal";
  if (d?.redCard || text.includes("red card")) return "red";
  if (d?.yellowCard || text.includes("yellow card")) return "yellow";
  if (text.includes("substitution")) return "sub";
  return "other";
}

function isReportable(kind: ParsedEvent["kind"]) {
  return kind !== "other";
}

async function findEspnEvent(fx: FixtureLite): Promise<{ eventId: string; slug: string } | null> {
  const ko = new Date(fx.kickoff_at);
  const dates = [-1, 0, 1].map((off) => {
    const d = new Date(ko.getTime() + off * 86_400_000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  });
  for (const slug of SLUGS) {
    for (const date of dates) {
      try {
        const res = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${date}&limit=200`,
          { headers: { accept: "application/json" } },
        );
        if (!res.ok) continue;
        const json: any = await res.json();
        for (const ev of json?.events ?? []) {
          const comp = ev?.competitions?.[0];
          const names: string[] = (comp?.competitors ?? []).map((c: any) => String(c?.team?.displayName ?? ""));
          if (!names.some((n) => BORO_RE.test(n))) continue;
          const diff = Math.abs(Date.parse(ev.date) - ko.getTime());
          if (diff > 3 * 86_400_000) continue;
          if (ev?.id) return { eventId: String(ev.id), slug };
        }
      } catch {
        // try the next feed
      }
    }
  }
  return null;
}

async function fetchEvents(eventId: string, slug: string): Promise<{ events: ParsedEvent[]; status: string | null }> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(eventId)}`,
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) return { events: [], status: null };
  const json: any = await res.json();
  const comp = json?.header?.competitions?.[0];
  const competitors: any[] = comp?.competitors ?? [];
  const nameFor = (id: string | null) =>
    competitors.find((c) => String(c?.team?.id ?? "") === String(id ?? ""))?.team?.displayName ?? null;

  const events: ParsedEvent[] = (comp?.details ?? []).map((d: any, i: number) => {
    const added = d?.addedClock?.displayValue ? `+${d.addedClock.displayValue}` : "";
    const players = (d?.participants ?? [])
      .map((p: any) => p?.athlete?.displayName)
      .filter(Boolean) as string[];
    return {
      key: String(d?.sequence ?? d?.id ?? `idx-${i}`),
      kind: classify(d),
      clock: d?.clock?.displayValue ? `${d.clock.displayValue}${added}` : null,
      team: nameFor(d?.team?.id ?? null),
      players,
      text: String(d?.type?.text ?? ""),
      homeScore: d?.homeScore != null ? Number(d.homeScore) : null,
      awayScore: d?.awayScore != null ? Number(d.awayScore) : null,
    };
  });
  return {
    events: events.filter((e) => isReportable(e.kind)),
    status: comp?.status?.type?.shortDetail ?? comp?.status?.type?.description ?? null,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ICON: Record<ParsedEvent["kind"], string> = {
  goal: "\u26bd",
  "own-goal": "\u26bd",
  penalty: "\u26bd",
  "penalty-missed": "\u274c",
  red: "\ud83d\udfe5",
  yellow: "\ud83d\udfe8",
  sub: "\ud83d\udd01",
  other: "\u2022",
};

export function describeEvent(ev: ParsedEvent, fx: FixtureLite): string {
  const min = ev.clock ? `${ev.clock}` : "";
  const team = ev.team ?? "";
  const who = ev.players.join(", ");
  switch (ev.kind) {
    case "goal":
      return `GOAL${team ? ` for ${team}` : ""}${who ? ` — ${who}` : ""}${min ? ` (${min})` : ""}`;
    case "own-goal":
      return `Own goal${who ? ` — ${who}` : ""}${team ? ` (${team})` : ""}${min ? ` (${min})` : ""}`;
    case "penalty":
      return `PENALTY SCORED${team ? ` for ${team}` : ""}${who ? ` — ${who}` : ""}${min ? ` (${min})` : ""}`;
    case "penalty-missed":
      return `Penalty missed${team ? ` by ${team}` : ""}${who ? ` — ${who}` : ""}${min ? ` (${min})` : ""}`;
    case "red":
      return `RED CARD${who ? ` — ${who}` : ""}${team ? ` (${team})` : ""}${min ? ` (${min})` : ""}`;
    case "yellow":
      return `Yellow card${who ? ` — ${who}` : ""}${team ? ` (${team})` : ""}${min ? ` (${min})` : ""}`;
    case "sub":
      return `Substitution${team ? ` — ${team}` : ""}${who ? `: ${who}` : ""}${min ? ` (${min})` : ""}`;
    default:
      return `${ev.text}${min ? ` (${min})` : ""}`;
  }
}

function scoreLine(ev: ParsedEvent, fx: FixtureLite): string | null {
  if (ev.homeScore == null || ev.awayScore == null) return null;
  return `${fx.home_team} ${ev.homeScore} - ${ev.awayScore} ${fx.away_team}`;
}

export function buildEventBody(ev: ParsedEvent, fx: FixtureLite, isUpdate: boolean): string {
  const heading = `${ICON[ev.kind]} ${isUpdate ? "Updated: " : ""}${describeEvent(ev, fx)}`;
  const parts = [`<p><strong>${escapeHtml(heading)}</strong></p>`];
  const score = scoreLine(ev, fx);
  if (score && (ev.kind === "goal" || ev.kind === "own-goal" || ev.kind === "penalty")) {
    parts.push(`<p>${escapeHtml(score)}</p>`);
  }
  if (isUpdate) {
    parts.push(`<p><em>This corrects the earlier post for this incident.</em></p>`);
  }
  return parts.join("\n");
}

export type EventSyncResult = {
  ok: boolean;
  fixture?: string;
  topic?: string | null;
  status?: string | null;
  posted: number;
  updated: number;
  skipped: string[];
  error?: string;
};

export async function syncBoroMatchEvents(opts?: { ignoreWindow?: boolean }): Promise<EventSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const skipped: string[] = [];
  const now = Date.now();

  const { data: fixtures, error: fxErr } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id, home_team, away_team, kickoff_at, competition")
    .gte("kickoff_at", new Date(now - 12 * 60 * 60 * 1000).toISOString())
    .lte("kickoff_at", new Date(now + 12 * 60 * 60 * 1000).toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(10);
  if (fxErr) return { ok: false, posted: 0, updated: 0, skipped, error: fxErr.message };

  const rows = (fixtures ?? []) as FixtureLite[];
  const fx = rows.find((row) => {
    const ko = Date.parse(row.kickoff_at);
    if (!Number.isFinite(ko)) return false;
    if (opts?.ignoreWindow) return true;
    return now >= ko - WINDOW_BEFORE_MS && now <= ko + WINDOW_AFTER_MS;
  });
  if (!fx) return { ok: true, posted: 0, updated: 0, skipped: ["no fixture inside the live match window"] };

  const label = `${fx.home_team} v ${fx.away_team}`;

  const { data: board } = await supabaseAdmin
    .from("forum_boards")
    .select("id")
    .eq("slug", "match-day")
    .maybeSingle();
  if (!board?.id) return { ok: true, fixture: label, posted: 0, updated: 0, skipped: ["match day board not found"] };

  const { data: topics } = await supabaseAdmin
    .from("forum_topics")
    .select("id, title, created_at, author_id")
    .eq("board_id", board.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const topic = matchTopicToFixture(
    (topics ?? []) as Array<{ id: string; title: string; created_at: string; author_id: string }>,
    fx,
  );
  if (!topic) {
    return { ok: true, fixture: label, topic: null, posted: 0, updated: 0, skipped: ["no match day thread for this fixture yet"] };
  }

  const espn = await findEspnEvent(fx);
  if (!espn) return { ok: true, fixture: label, topic: topic.title, posted: 0, updated: 0, skipped: ["no ESPN match found"] };

  const { events, status } = await fetchEvents(espn.eventId, espn.slug);
  if (events.length === 0) {
    return { ok: true, fixture: label, topic: topic.title, status, posted: 0, updated: 0, skipped: ["no match events yet"] };
  }

  const { data: logged } = await supabaseAdmin
    .from("boro_match_event_posts")
    .select("id, event_key, fingerprint, revision")
    .eq("fixture_id", fx.id);
  const byKey = new Map(
    ((logged ?? []) as Array<{ id: string; event_key: string; fingerprint: string; revision: number }>).map((r) => [
      r.event_key,
      r,
    ]),
  );

  let posted = 0;
  let updated = 0;

  for (const ev of events) {
    const fingerprint = `${ev.kind}|${ev.clock ?? ""}|${ev.team ?? ""}|${ev.players.join("/")}|${ev.homeScore ?? ""}-${ev.awayScore ?? ""}`;
    const prev = byKey.get(ev.key);
    if (prev && prev.fingerprint === fingerprint) continue;

    const isUpdate = !!prev;
    const body = buildEventBody(ev, fx, isUpdate);
    const { data: post, error: postErr } = await supabaseAdmin
      .from("forum_posts")
      .insert({ topic_id: topic.id, author_id: topic.author_id, body })
      .select("id")
      .single();
    if (postErr) {
      skipped.push(`post failed (${ev.key}): ${postErr.message}`);
      continue;
    }

    if (prev) {
      const { error: upErr } = await supabaseAdmin
        .from("boro_match_event_posts")
        .update({
          post_id: post.id,
          kind: ev.kind,
          clock: ev.clock,
          summary: describeEvent(ev, fx),
          fingerprint,
          revision: (prev.revision ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prev.id);
      if (upErr) skipped.push(`log update failed (${ev.key}): ${upErr.message}`);
      updated += 1;
    } else {
      const { error: insErr } = await supabaseAdmin.from("boro_match_event_posts").insert({
        fixture_id: fx.id,
        topic_id: topic.id,
        post_id: post.id,
        event_key: ev.key,
        kind: ev.kind,
        clock: ev.clock,
        summary: describeEvent(ev, fx),
        fingerprint,
        revision: 0,
      });
      if (insErr) skipped.push(`log failed (${ev.key}): ${insErr.message}`);
      posted += 1;
      byKey.set(ev.key, { id: "", event_key: ev.key, fingerprint, revision: 0 });
    }
  }

  return { ok: true, fixture: label, topic: topic.title, status, posted, updated, skipped };
}
