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
import type { FotmobEventDetail } from "@/lib/fotmob-boro.types";

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

type CardPlayer = { name: string; number: string | null; position: string | null };

/** FotMob's shirt-number chip + name + position row, optionally with an in/out arrow. */
function playerRow(label: "in" | "out" | null, player: CardPlayer, accent: string): string {
  const arrow =
    label === "in"
      ? `<span style="color:#22c55e;font-size:15px;font-weight:700;line-height:1">&#9650;</span>`
      : label === "out"
        ? `<span style="color:#ef4444;font-size:15px;font-weight:700;line-height:1">&#9660;</span>`
        : "";
  const chip = player.number
    ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 5px;border-radius:6px;background:${accent};color:#fff;font-size:12px;font-weight:700;line-height:1">${escapeHtml(
        player.number,
      )}</span>`
    : "";
  const pos = player.position
    ? `<span style="opacity:.6;font-size:12px">${escapeHtml(player.position)}</span>`
    : "";
  return `<div class="not-prose" style="display:flex;align-items:center;gap:8px;margin:4px 0">${arrow}${chip}<span style="font-weight:700;font-size:15px">${escapeHtml(
    player.name,
  )}</span>${pos}</div>`;
}

/** FotMob's three-up metric strip (shot type / xG / xGOT). */
function metricStrip(items: Array<{ label: string; value: string }>): string {
  if (items.length === 0) return "";
  const cells = items
    .map(
      (item) =>
        `<div style="flex:1 1 0;min-width:84px;border-radius:10px;background:rgba(127,127,127,.12);padding:8px 10px;text-align:center">
  <div style="font-size:15px;font-weight:700;line-height:1.2">${escapeHtml(item.value)}</div>
  <div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.6;margin-top:2px">${escapeHtml(item.label)}</div>
</div>`,
    )
    .join("");
  return `<div class="not-prose" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${cells}</div>`;
}

/** FotMob's shot-location graphic: goal frame with the ball's crossing point. */
function goalMouthSvg(mouth: { x: number; y: number }, accent: string, onTarget: boolean): string {
  const left = Math.min(100, Math.max(0, (mouth.x / 2) * 100));
  const up = Math.min(100, Math.max(0, mouth.y * 100));
  // Goal frame is drawn 240x88 with a 10px margin; y is measured from the ground.
  const cx = 12 + (left / 100) * 216;
  const cy = 80 - (up / 100) * 66;
  const netLines = [0.2, 0.4, 0.6, 0.8]
    .map((f) => `<line x1="${12 + f * 216}" y1="14" x2="${12 + f * 216}" y2="80" stroke="rgba(127,127,127,.28)" stroke-width="1" />`)
    .join("");
  const netRows = [0.33, 0.66]
    .map((f) => `<line x1="12" y1="${14 + f * 66}" x2="228" y2="${14 + f * 66}" stroke="rgba(127,127,127,.28)" stroke-width="1" />`)
    .join("");
  return `<div class="not-prose" style="margin-top:10px;border-radius:10px;background:rgba(127,127,127,.10);padding:8px 10px">
<svg viewBox="0 0 240 92" width="100%" style="max-width:280px;display:block;margin:0 auto">
  ${netLines}${netRows}
  <path d="M12 80 L12 14 L228 14 L228 80" fill="none" stroke="rgba(160,160,160,.85)" stroke-width="3" />
  <line x1="4" y1="80" x2="236" y2="80" stroke="rgba(160,160,160,.55)" stroke-width="2" />
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="${onTarget ? accent : "rgba(127,127,127,.7)"}" stroke="#fff" stroke-width="2" />
</svg>
<div style="text-align:center;font-size:11px;opacity:.6;margin-top:4px">Shot location</div>
</div>`;
}

/** FotMob-shaped card: minute badge, headline, player block, narrative, shot metrics. */
function buildFotmobCard(ev: ParsedEvent, isUpdate: boolean): string {
  const d = ev.detail!;
  const accent = /^#[0-9a-f]{3,8}$/i.test(d.teamColor ?? "") ? d.teamColor! : "#E11B22";
  const minute = d.minuteLabel || ev.clock || "";
  const isGoal = ev.kind === "goal" || ev.kind === "own-goal" || ev.kind === "penalty";

  const head = `<div class="not-prose" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
  ${minute ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:26px;padding:0 8px;border-radius:999px;background:${accent};color:#fff;font-size:13px;font-weight:800;line-height:1">${escapeHtml(minute)}</span>` : ""}
  <span style="font-size:17px;font-weight:800;letter-spacing:-.01em">${ICON[ev.kind] ?? ""} ${escapeHtml(d.headline)}</span>
  ${d.teamName ? `<span style="font-size:13px;opacity:.65">${escapeHtml(d.teamName)}</span>` : ""}
  ${isUpdate ? `<span style="margin-left:auto;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#f59e0b">Updated</span>` : ""}
</div>`;

  const players = [
    d.playerIn ? playerRow("in", d.playerIn, "#16a34a") : "",
    d.playerOut ? playerRow("out", d.playerOut, "#dc2626") : "",
    d.player ? playerRow(null, d.player, accent) : "",
  ].join("");

  const score =
    isGoal && d.scoreLine
      ? `<div class="not-prose" style="margin-top:8px;display:inline-block;border-radius:8px;border:1px solid rgba(127,127,127,.3);padding:4px 10px;font-size:13px;font-weight:700">${escapeHtml(d.scoreLine)}</div>`
      : "";

  const assist =
    d.assist && !d.narrative.includes(d.assist)
      ? `<div class="not-prose" style="margin-top:6px;font-size:13px;opacity:.75">Assist: ${escapeHtml(d.assist)}</div>`
      : "";

  const narrative = d.narrative
    ? `<div class="not-prose" style="margin-top:8px;font-size:14px;line-height:1.5;opacity:.9">${escapeHtml(d.narrative)}</div>`
    : "";

  const metrics = metricStrip(
    [
      d.shotType ? { label: "Shot type", value: d.shotType } : null,
      d.xg ? { label: "xG", value: d.xg } : null,
      d.xgot ? { label: "xGOT", value: d.xgot } : null,
    ].filter((x): x is { label: string; value: string } => !!x),
  );

  const diagram = d.goalMouth ? goalMouthSvg(d.goalMouth, accent, d.onTarget !== false) : "";

  const note = isUpdate
    ? `<div class="not-prose" style="margin-top:8px;font-size:12px;opacity:.65"><em>This corrects the earlier post for this incident.</em></div>`
    : "";

  return `<div class="not-prose" style="max-width:520px;margin:6px 0;border:1px solid rgba(127,127,127,.28);border-left:4px solid ${accent};border-radius:14px;background:rgba(127,127,127,.06);padding:14px 16px">
${head}${players}${score}${assist}${narrative}${metrics}${diagram}${note}
</div>`;
}


const HEADLINE: Partial<Record<ParsedEvent["kind"], string>> = {
  goal: "Goal!",
  penalty: "Penalty scored!",
  "penalty-missed": "Penalty missed",
  "own-goal": "Own goal",
  red: "Red card",
  yellow: "Yellow card",
  sub: "Substitution",
  var: "VAR check",
  "shootout-scored": "Shootout — scored",
  "shootout-missed": "Shootout — missed",
};

/**
 * Every matchday event renders in the FotMob-style card. When the live source
 * gives us no FotMob detail block (e.g. ESPN fallback), synthesise the same
 * shape from the base event so the thread layout never changes between games.
 */
function detailFromEvent(ev: ParsedEvent, fx: FixtureLite): FotmobEventDetail {
  const player = (name: string | null | undefined) =>
    name ? { name, number: null, position: null } : null;
  const narrative = ev.text && ev.text !== ev.shortText ? ev.text : ev.shortText || "";
  const isGoal = ev.kind === "goal" || ev.kind === "own-goal" || ev.kind === "penalty";
  return {
    minuteLabel: ev.clock ?? "",
    headline: HEADLINE[ev.kind] ?? (ev.shortText || describeEvent(ev, fx)),
    narrative,
    teamName: ev.teamName,
    isHome: !!ev.teamName && ev.teamName === fx.home_team,
    player: ev.kind === "sub" ? null : player(ev.players[0]),
    playerIn: player(ev.playerIn),
    playerOut: player(ev.playerOut),
    assist: ev.assist,
    shotType: null,
    xg: null,
    xgot: null,
    card: ev.kind === "yellow" ? "Yellow" : ev.kind === "red" ? "Red" : null,
    teamColor: ev.teamName === "Middlesbrough" ? "#E11B22" : null,
    scoreLine: isGoal ? scoreLine(ev, fx) : null,
    goalMouth: null,
    onTarget: null,
  };
}

export function buildEventBody(ev: ParsedEvent, fx: FixtureLite, isUpdate: boolean): string {
  if (ev.detail) return buildFotmobCard(ev, isUpdate);
  return buildFotmobCard({ ...ev, detail: detailFromEvent(ev, fx) }, isUpdate);
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
    .select("id, event_key, fingerprint, revision, post_id, kind, summary")
    .eq("fixture_id", fx.id);
  type LoggedRow = {
    id: string;
    event_key: string;
    fingerprint: string;
    revision: number;
    post_id: string;
    kind: string;
    summary: string | null;
  };
  const loggedRows = (logged ?? []) as LoggedRow[];
  const byKey = new Map(loggedRows.map((r) => [r.event_key, r]));
  // Live sources issue different event ids for the same incident (ESPN vs
  // FotMob), so also index each logged reply by what it describes. That lets a
  // mid-match source switch adopt the existing reply instead of double-posting.
  const identity = (kind: string, summary: string | null | undefined) =>
    `${kind}|${(summary ?? "").split(" (")[0]!.trim().toLowerCase()}`;
  const byIdentity = new Map<string, LoggedRow>();
  for (const row of loggedRows) {
    const id = identity(row.kind, row.summary);
    if (row.summary && !byIdentity.has(id)) byIdentity.set(id, row);
  }

  const authorId = (await getMatchDayAuthorId()) ?? topic.author_id;

  let posted = 0;
  let updated = 0;

  for (const ev of events) {
    const fingerprint = `${ev.kind}|${ev.clock ?? ""}|${ev.teamName ?? ""}|${ev.players.join("/")}|${ev.homeScore ?? ""}-${ev.awayScore ?? ""}`;
    const summary = describeEvent(ev, fx);
    const evIdentity = identity(ev.kind, summary);
    const prev = byKey.get(ev.key) ?? byIdentity.get(evIdentity);
    // Same incident already logged under a different source's event id.
    const adopted = !!prev && prev.event_key !== ev.key;
    if (prev && prev.fingerprint === fingerprint && !adopted && !opts?.rebuild) continue;

    // Rebuild mode (or an adopted incident): rewrite the existing reply in place
    // so the thread shows the current layout without duplicating the incident.
    if (prev && (opts?.rebuild || adopted) && prev.post_id) {
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
        .update({ event_key: ev.key, clock: ev.clock, fingerprint, summary, updated_at: new Date().toISOString() })
        .eq("id", prev.id);
      byKey.set(ev.key, { ...prev, event_key: ev.key, fingerprint, summary });
      byIdentity.set(evIdentity, { ...prev, event_key: ev.key, fingerprint, summary });
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
          summary,
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
        summary,
        fingerprint,
        revision: 0,
      });
      if (insErr) skipped.push(`log failed (${ev.key}): ${insErr.message}`);
      posted += 1;
      const row: LoggedRow = {
        id: "",
        event_key: ev.key,
        fingerprint,
        revision: 0,
        post_id: post.id,
        kind: ev.kind,
        summary,
      };
      byKey.set(ev.key, row);
      byIdentity.set(evIdentity, row);
    }
  }

  return { ok: true, fixture: label, topic: topic.title, status, posted, updated, skipped };
}
