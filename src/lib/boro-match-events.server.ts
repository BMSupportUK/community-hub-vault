// Posts live match events (goals + scorer, yellow/red cards, penalties and
// substitutions) into the Middlesbrough match day forum thread as replies, and
// posts an updated reply whenever ESPN corrects an event it already reported.

import { matchTopicToFixture, type FixtureLite } from "@/lib/boro-team-sheet.server";
import {
  normaliseEspnSummary,
  isReportableEvent,
  describeEspnEvent,
  type EspnMatchEvent,
} from "@/lib/boro-espn-events";
import { espnJson, espnDateRange } from "@/lib/espn-fetch";

const SLUGS = ["eng.2", "eng.fa", "eng.league_cup", "eng.trophy"];
const ESPN_TEAM_ID = "369"; // Middlesbrough
const BORO_RE = /\bmiddles(?:brough|borough)\b|\bboro\b/i;

const WINDOW_BEFORE_MS = 30 * 60 * 1000; // start watching 30m before KO
const WINDOW_AFTER_MS = 4 * 60 * 60 * 1000; // keep watching 4h after KO

type ParsedEvent = EspnMatchEvent;

export async function findEspnEvent(fx: FixtureLite): Promise<{ eventId: string; slug: string } | null> {
  const ko = new Date(fx.kickoff_at);
  const range = espnDateRange(ko.getTime() - 86_400_000, ko.getTime() + 86_400_000);

  const match = (json: any, slug: string) => {
    for (const ev of json?.events ?? []) {
      const comp = ev?.competitions?.[0];
      const names: string[] = (comp?.competitors ?? []).map((c: any) => String(c?.team?.displayName ?? ""));
      if (!names.some((n) => BORO_RE.test(n))) continue;
      const diff = Math.abs(Date.parse(ev.date) - ko.getTime());
      if (diff > 3 * 86_400_000) continue;
      if (ev?.id) return { eventId: String(ev.id), slug };
    }
    return null;
  };

  // Team schedule first: one request per competition and it always carries
  // Boro's own fixtures, so a fixture is found even if the day scoreboard
  // feed is unavailable.
  for (const slug of SLUGS) {
    const json = await espnJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${ESPN_TEAM_ID}/schedule`,
    );
    const hit = match(json, slug);
    if (hit) return hit;
  }

  for (const slug of SLUGS) {
    const json = await espnJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${range}&limit=400`,
    );
    const hit = match(json, slug);
    if (hit) return hit;
  }

  // Last resort: a summary relayed from a visitor's browser already tells us
  // the event id, so live event posting keeps working even if every ESPN
  // lookup path is refused for this worker.
  const { getCachedSummaryForFixture } = await import("@/lib/espn-summary-cache.server");
  const cached = await getCachedSummaryForFixture(fx);
  const cachedId = String(cached?.header?.id ?? "");
  if (/^\d{4,12}$/.test(cachedId)) {
    return { eventId: cachedId, slug: String(cached?.header?.league?.slug ?? "eng.2") };
  }

  return null;
}

async function fetchEvents(
  eventId: string,
  slug: string,
  fx: FixtureLite,
): Promise<{ events: ParsedEvent[]; status: string | null }> {
  const { fetchFotmobSummary } = await import("@/lib/fotmob-boro.server");
  const fotmob = await fetchFotmobSummary({ home: fx.home_team, away: fx.away_team, kickoff: fx.kickoff_at });
  if (fotmob) {
    const norm = normaliseEspnSummary(fotmob);
    return { events: norm.events.filter((event) => isReportableEvent(event.kind)), status: norm.status };
  }

  let json: any = await espnJson(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(eventId)}`,
  );
  if (!Array.isArray(json?.header?.competitions) || json.header.competitions.length === 0) {
    const { getCachedEspnSummary } = await import("@/lib/espn-summary-cache.server");
    json = (await getCachedEspnSummary(eventId)) ?? json;
  }
  if (!json) return { events: [], status: null };
  const norm = normaliseEspnSummary(json);
  return {
    events: norm.events.filter((e) => isReportableEvent(e.kind)),
    status: norm.status,
  };
}


function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ICON: Partial<Record<ParsedEvent["kind"], string>> = {
  goal: "\u26bd",
  "own-goal": "\u26bd",
  penalty: "\u26bd",
  "penalty-missed": "\u274c",
  red: "\ud83d\udfe5",
  yellow: "\ud83d\udfe8",
  sub: "\ud83d\udd01",
  other: "\u2022",
};

export function describeEvent(ev: ParsedEvent, _fx: FixtureLite): string {
  return describeEspnEvent(ev);
}

function scoreLine(ev: ParsedEvent, fx: FixtureLite): string | null {
  if (ev.homeScore == null || ev.awayScore == null) return null;
  return `${fx.home_team} ${ev.homeScore} - ${ev.awayScore} ${fx.away_team}`;
}

function playerRow(
  label: "in" | "out" | null,
  player: { name: string; number: string | null; position: string | null },
): string {
  const arrow = label === "in" ? "\u2b06\ufe0f " : label === "out" ? "\u2b07\ufe0f " : "";
  const num = player.number ? `${escapeHtml(player.number)} ` : "";
  const pos = player.position ? `<br /><span style="opacity:.7;font-size:13px">${escapeHtml(player.position)}</span>` : "";
  return `<p style="margin:2px 0">${arrow}<strong>${num}${escapeHtml(player.name)}</strong>${pos}</p>`;
}

/** FotMob-shaped card: minute badge, headline, player block, narrative, shot metrics. */
function buildFotmobCard(ev: ParsedEvent, isUpdate: boolean): string {
  const d = ev.detail!;
  const parts: string[] = [];
  parts.push(
    `<p style="margin:0 0 6px"><strong>${escapeHtml(d.minuteLabel || ev.clock || "")} ${ICON[ev.kind] ?? ""} ${escapeHtml(
      `${isUpdate ? "Updated: " : ""}${d.headline}`,
    )}</strong>${d.teamName ? ` <span style="opacity:.75">· ${escapeHtml(d.teamName)}</span>` : ""}</p>`,
  );
  if (d.playerIn) parts.push(playerRow("in", d.playerIn));
  if (d.playerOut) parts.push(playerRow("out", d.playerOut));
  if (d.player) parts.push(playerRow(null, d.player));
  if (d.narrative) parts.push(`<p style="margin:8px 0 0">${escapeHtml(d.narrative)}</p>`);
  const metrics: string[] = [];
  if (d.shotType) metrics.push(`Shot type: ${d.shotType}`);
  if (d.xg) metrics.push(`xG: ${d.xg}`);
  if (d.xgot) metrics.push(`xGOT: ${d.xgot}`);
  if (metrics.length) {
    parts.push(`<p style="margin:8px 0 0;opacity:.8;font-size:13px">${escapeHtml(metrics.join("  ·  "))}</p>`);
  }
  if (isUpdate) parts.push(`<p><em>This corrects the earlier post for this incident.</em></p>`);
  return parts.join("\n");
}

export function buildEventBody(ev: ParsedEvent, fx: FixtureLite, isUpdate: boolean): string {
  if (ev.detail) return buildFotmobCard(ev, isUpdate);
  const heading = `${ICON[ev.kind] ?? "\u2022"} ${isUpdate ? "Updated: " : ""}${describeEvent(ev, fx)}`;
  const parts = [`<p><strong>${escapeHtml(heading)}</strong></p>`];
  const score = scoreLine(ev, fx);
  if (score && (ev.kind === "goal" || ev.kind === "own-goal" || ev.kind === "penalty")) {
    parts.push(`<p>${escapeHtml(score)}</p>`);
  }
  if (ev.text && ev.text !== ev.shortText) {
    parts.push(`<p>${escapeHtml(ev.text)}</p>`);
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

export async function syncBoroMatchEvents(opts?: {
  ignoreWindow?: boolean;
  /** Rewrite the bodies of posts already made for this fixture (e.g. after a formatting change). */
  rebuild?: boolean;
}): Promise<EventSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getMatchDayAuthorId } = await import("@/lib/boro-bot-author.server");
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
    if (opts?.ignoreWindow || opts?.rebuild) return true;
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

  const { resolveFotmobMatch } = await import("@/lib/fotmob-boro.server");
  const fotmobId = await resolveFotmobMatch({ home: fx.home_team, away: fx.away_team, kickoff: fx.kickoff_at });
  const espn = fotmobId ? { eventId: fotmobId, slug: "fotmob" } : await findEspnEvent(fx);
  if (!espn) return { ok: true, fixture: label, topic: topic.title, posted: 0, updated: 0, skipped: ["no live-data match found"] };

  const { events, status } = await fetchEvents(espn.eventId, espn.slug, fx);
  if (events.length === 0) {
    return { ok: true, fixture: label, topic: topic.title, status, posted: 0, updated: 0, skipped: ["no match events yet"] };
  }

  const { data: logged } = await supabaseAdmin
    .from("boro_match_event_posts")
    .select("id, event_key, fingerprint, revision, post_id")
    .eq("fixture_id", fx.id);
  const byKey = new Map(
    ((logged ?? []) as Array<{ id: string; event_key: string; fingerprint: string; revision: number; post_id: string }>).map((r) => [
      r.event_key,
      r,
    ]),
  );

  const authorId = (await getMatchDayAuthorId()) ?? topic.author_id;

  let posted = 0;
  let updated = 0;

  for (const ev of events) {
    const fingerprint = `${ev.kind}|${ev.clock ?? ""}|${ev.teamName ?? ""}|${ev.players.join("/")}|${ev.homeScore ?? ""}-${ev.awayScore ?? ""}`;
    const prev = byKey.get(ev.key);
    if (prev && prev.fingerprint === fingerprint && !opts?.rebuild) continue;

    // Rebuild mode: rewrite the existing reply in place so the thread shows the
    // FotMob layout without duplicating the incident.
    if (prev && opts?.rebuild && prev.post_id) {
      const { error: bodyErr } = await supabaseAdmin
        .from("forum_posts")
        .update({ body: buildEventBody(ev, fx, false) })
        .eq("id", prev.post_id);
      if (bodyErr) {
        skipped.push(`rewrite failed (${ev.key}): ${bodyErr.message}`);
        continue;
      }
      await supabaseAdmin
        .from("boro_match_event_posts")
        .update({ fingerprint, summary: describeEvent(ev, fx), updated_at: new Date().toISOString() })
        .eq("id", prev.id);
      updated += 1;
      continue;
    }

    const isUpdate = !!prev && !opts?.rebuild;
    const body = buildEventBody(ev, fx, isUpdate);
    const { data: post, error: postErr } = await supabaseAdmin
      .from("forum_posts")
      .insert({ topic_id: topic.id, author_id: authorId, body })
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
      byKey.set(ev.key, { id: "", event_key: ev.key, fingerprint, revision: 0, post_id: post.id });
    }
  }

  return { ok: true, fixture: label, topic: topic.title, status, posted, updated, skipped };
}
