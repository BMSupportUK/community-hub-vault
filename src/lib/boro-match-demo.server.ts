// Demo poster: fills a match day thread with sample versions of every automated
// reply the bot produces (pre-match preview, pinned live block, match events,
// half-time summary, team sheet placeholder) so the setup can be eyeballed
// before a real game. Everything it writes carries the DEMO_MARKER so it can be
// deleted again in one call.

import type { FixtureLite } from "@/lib/boro-team-sheet.server";
import { buildPreviewBody, buildLiveBlock, buildHalfTimeBody, buildFullTimeBody } from "@/lib/boro-match-thread.server";
import { buildEventBody } from "@/lib/boro-match-events.server";
import { normaliseEspnSummary, type EspnMatchEvent } from "@/lib/boro-espn-events";

export const DEMO_MARKER = "<!--boro-demo-->";
const HOME_ID = "331";
const AWAY_ID = "318";

function team(id: string, name: string, homeAway: "home" | "away", score: string) {
  return { homeAway, score, team: { id, displayName: name } };
}

function detail(o: {
  id: string;
  clock: string;
  period: number;
  teamId: string;
  text: string;
  shortText: string;
  scoringPlay?: boolean;
  yellowCard?: boolean;
  redCard?: boolean;
  penaltyKick?: boolean;
  type: string;
  players?: string[];
}) {
  return {
    id: o.id,
    clock: { displayValue: o.clock },
    period: { number: o.period },
    team: { id: o.teamId },
    text: o.text,
    shortText: o.shortText,
    scoringPlay: !!o.scoringPlay,
    yellowCard: !!o.yellowCard,
    redCard: !!o.redCard,
    penaltyKick: !!o.penaltyKick,
    type: { type: o.type, text: o.shortText },
    participants: (o.players ?? []).map((p) => ({ athlete: { displayName: p } })),
  };
}

function statBlock(values: Record<string, string>) {
  return { statistics: Object.entries(values).map(([name, displayValue]) => ({ name, displayValue })) };
}

/** A synthetic ESPN Gamecast payload good enough to drive every builder. */
export function demoSummary(fx: FixtureLite, state: "pre" | "live" | "ht" | "ft") {
  const details =
    state === "pre"
      ? []
      : [
          detail({
            id: "d1",
            clock: "12'",
            period: 1,
            teamId: HOME_ID,
            type: "goal",
            shortText: "Goal",
            text: `Goal! ${fx.home_team} 1, ${fx.away_team} 0. Sample Striker (${fx.home_team}) right footed shot from the centre of the box.`,
            scoringPlay: true,
            players: ["Sample Striker", "Sample Winger"],
          }),
          detail({
            id: "d2",
            clock: "27'",
            period: 1,
            teamId: AWAY_ID,
            type: "yellow-card",
            shortText: "Yellow Card",
            text: `Demo Midfielder (${fx.away_team}) is shown the yellow card for a bad foul.`,
            yellowCard: true,
            players: ["Demo Midfielder"],
          }),
          detail({
            id: "d3",
            clock: "38'",
            period: 1,
            teamId: AWAY_ID,
            type: "goal",
            shortText: "Goal",
            text: `Goal! ${fx.home_team} 1, ${fx.away_team} 1. Demo Forward (${fx.away_team}) header from the centre of the box.`,
            scoringPlay: true,
            players: ["Demo Forward"],
          }),
          detail({
            id: "d4",
            clock: "55'",
            period: 2,
            teamId: HOME_ID,
            type: "penalty-goal",
            shortText: "Penalty Scored",
            text: `Penalty scored! ${fx.home_team} 2, ${fx.away_team} 1. Sample Captain converts from the spot.`,
            scoringPlay: true,
            penaltyKick: true,
            players: ["Sample Captain"],
          }),
          detail({
            id: "d5",
            clock: "63'",
            period: 2,
            teamId: AWAY_ID,
            type: "red-card",
            shortText: "Red Card",
            text: `Demo Defender (${fx.away_team}) is shown the red card.`,
            redCard: true,
            players: ["Demo Defender"],
          }),
          detail({
            id: "d6",
            clock: "70'",
            period: 2,
            teamId: HOME_ID,
            type: "substitution",
            shortText: "Substitution",
            text: `Substitution, ${fx.home_team}. Sample Sub replaces Sample Winger.`,
            players: ["Sample Sub", "Sample Winger"],
          }),
        ];

  const statusType =
    state === "pre"
      ? { state: "pre", shortDetail: "Scheduled", detail: "Scheduled", description: "Scheduled" }
      : state === "ht"
        ? { state: "in", shortDetail: "HT", detail: "Half Time", description: "Half Time" }
        : state === "ft"
        ? { state: "post", completed: true, shortDetail: "FT", detail: "Full Time", description: "Full Time" }
        : { state: "in", shortDetail: "70'", detail: "2nd Half", description: "In Progress" };

  const homeScore = state === "pre" ? "0" : state === "ht" ? "1" : "2";
  const awayScore = state === "pre" ? "0" : "1";

  return {
    header: {
      competitions: [
        {
          competitors: [
            team(HOME_ID, fx.home_team, "home", homeScore),
            team(AWAY_ID, fx.away_team, "away", awayScore),
          ],
          status: { type: statusType, displayClock: state === "live" ? "70'" : "" },
          details: state === "ht" ? details.filter((d) => (d as any).period.number === 1) : details,
        },
      ],
    },
    gameInfo: {
      venue: { fullName: "Riverside Stadium", address: { city: "Middlesbrough" } },
      officials: [{ displayName: "A. Demo Referee", position: { displayName: "Referee" } }],
    },
    broadcasts: [{ media: { shortName: "Sky Sports+ (demo)" } }],
    odds: [
      {
        details: "MID -1",
        overUnder: 2.5,
        homeTeamOdds: { moneyLine: -180 },
        awayTeamOdds: { moneyLine: 450 },
        drawOdds: { moneyLine: 300 },
        provider: { name: "Demo odds" },
      },
    ],
    standings: {
      groups: [
        {
          standings: {
            entries: [
              {
                id: HOME_ID,
                stats: [
                  { name: "gamesPlayed", value: 3 },
                  { name: "rank", displayValue: "4th" },
                  { name: "points", displayValue: "6" },
                ],
              },
              {
                id: AWAY_ID,
                stats: [
                  { name: "gamesPlayed", value: 3 },
                  { name: "rank", displayValue: "12th" },
                  { name: "points", displayValue: "4" },
                ],
              },
            ],
          },
        },
      ],
    },
    lastFiveGames: [
      {
        team: { id: HOME_ID },
        events: [
          { gameResult: "W", score: "2-0", atVs: "vs", opponent: { id: "999", displayName: "Demo Rovers" }, leagueAbbreviation: "CHA", gameDate: "2026-08-08" },
          { gameResult: "D", score: "1-1", atVs: "@", opponent: { id: AWAY_ID, displayName: fx.away_team }, leagueAbbreviation: "CUP", gameDate: "2026-08-02" },
          { gameResult: "L", score: "0-1", atVs: "@", opponent: { id: "998", displayName: "Demo Town" }, leagueAbbreviation: "CHA", gameDate: "2026-07-27" },
        ],
      },
      {
        team: { id: AWAY_ID },
        events: [
          { gameResult: "L", score: "0-3", atVs: "@", opponent: { id: "997", displayName: "Demo United" }, leagueAbbreviation: "L1", gameDate: "2026-08-08" },
          { gameResult: "W", score: "2-1", atVs: "vs", opponent: { id: "996", displayName: "Demo City" }, leagueAbbreviation: "L1", gameDate: "2026-08-01" },
        ],
      },
    ],
    rosters: [
      {
        homeAway: "home",
        team: { displayName: fx.home_team },
        roster: [
          ...["Sample Keeper|GK", "Sample Right Back|RB", "Sample Centre Back|CB", "Sample Centre Half|CB", "Sample Left Back|LB", "Sample Anchor|CM", "Sample Captain|CM", "Sample Winger|RW", "Sample Ten|AM", "Sample Left Wing|LW", "Sample Striker|ST"].map((s) => {
            const [name, pos] = s.split("|");
            return { starter: true, athlete: { displayName: name }, position: { abbreviation: pos } };
          }),
          ...["Sample Sub|ST", "Sample Bench Keeper|GK", "Sample Bench Mid|CM"].map((s) => {
            const [name, pos] = s.split("|");
            return { starter: false, athlete: { displayName: name }, position: { abbreviation: pos } };
          }),
        ],
      },
      {
        homeAway: "away",
        team: { displayName: fx.away_team },
        roster: ["Demo Keeper|GK", "Demo Defender|CB", "Demo Midfielder|CM", "Demo Forward|ST"].map((s) => {
          const [name, pos] = s.split("|");
          return { starter: true, athlete: { displayName: name }, position: { abbreviation: pos } };
        }),
      },
    ],
    boxscore: {
      teams: [
        {
          homeAway: "home",
          statistics: statBlock({ possessionPct: "58.2", totalShots: "14", shotsOnTarget: "6", blockedShots: "3", wonCorners: "7", offsides: "1", foulsCommitted: "9", yellowCards: "1", redCards: "0", saves: "2", accuratePasses: "412", totalPasses: "487" }).statistics,
        },
        {
          homeAway: "away",
          statistics: statBlock({ possessionPct: "41.8", totalShots: "8", shotsOnTarget: "3", blockedShots: "1", wonCorners: "3", offsides: "2", foulsCommitted: "13", yellowCards: "2", redCards: "1", saves: "4", accuratePasses: "281", totalPasses: "365" }).statistics,
        },
      ],
    },
  };
}

export type DemoResult = {
  ok: boolean;
  topic?: string;
  posted?: string[];
  deleted?: number;
  error?: string;
};

async function resolveTopic(topicId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const q = supabaseAdmin
    .from("forum_topics")
    .select("id, title, author_id, board_id, forum_boards!inner(slug)")
    .order("created_at", { ascending: false })
    .limit(1);
  const { data } = topicId
    ? await supabaseAdmin.from("forum_topics").select("id, title, author_id").eq("id", topicId).maybeSingle()
    : await (async () => {
        const { data: rows } = await q;
        return { data: (rows ?? [])[0] ?? null };
      })();
  return (data as { id: string; title: string; author_id: string } | null) ?? null;
}

/** Delete every demo reply this module created in a topic. */
export async function clearBoroDemoPosts(topicId?: string): Promise<DemoResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const topic = await resolveTopic(topicId);
  if (!topic) return { ok: false, error: "topic not found" };
  const { data: posts } = await supabaseAdmin
    .from("forum_posts")
    .select("id, body")
    .eq("topic_id", topic.id);
  const ids = (posts ?? []).filter((p: any) => String(p.body ?? "").includes(DEMO_MARKER)).map((p: any) => p.id);
  if (ids.length) {
    await supabaseAdmin.from("boro_match_event_posts").delete().in("post_id", ids);
    await supabaseAdmin.from("forum_posts").delete().in("id", ids);
  }
  return { ok: true, topic: topic.title, deleted: ids.length };
}

function guessFixture(title: string): FixtureLite {
  const m = title.match(/^(.+?)\s+v\s+(.+?)\s+\d/i) ?? title.match(/^(.+?)\s+v\s+(.+)$/i);
  return {
    id: "demo",
    home_team: (m?.[1] ?? "Middlesbrough").trim(),
    away_team: (m?.[2] ?? "Opponent").trim(),
    kickoff_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    competition: "Demo fixture",
  } as FixtureLite;
}

/** Post one demo copy of every automated reply into a match day thread. */
export async function postBoroDemoPosts(topicId?: string): Promise<DemoResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getMatchDayAuthorId } = await import("@/lib/boro-bot-author.server");
  const topic = await resolveTopic(topicId);
  if (!topic) return { ok: false, error: "topic not found" };
  const fx = guessFixture(topic.title);
  const authorId = (await getMatchDayAuthorId()) ?? topic.author_id;
  const posted: string[] = [];

  const banner = `<p><em>DEMO DATA — sample of an automated post. Safe to delete.</em></p>`;
  const add = async (label: string, body: string, pinned = false) => {
    const { error } = await supabaseAdmin.from("forum_posts").insert({
      topic_id: topic.id,
      author_id: authorId,
      body: `${DEMO_MARKER}${banner}${body}`,
      ...(pinned ? { is_pinned: true } : {}),
    } as any);
    posted.push(error ? `${label}: FAILED ${error.message}` : label);
  };

  const live = demoSummary(fx, "live");
  const pre = demoSummary(fx, "pre");
  const ht = demoSummary(fx, "ht");
  const ft = demoSummary(fx, "ft");

  // 1. Pinned live block (refreshed in place during a real game).
  await add("pinned live block", buildLiveBlock(fx, live), true);
  // 2. Pre-match preview first reply.
  await add("pre-match preview", buildPreviewBody(fx, pre));
  // 3. Team sheet reply (the real job posts the official graphic).
  await add(
    "team sheet",
    `<p><strong>Team news — ${fx.home_team} XI</strong></p><p>Sample Keeper, Sample Right Back, Sample Centre Back, Sample Centre Half, Sample Left Back, Sample Anchor, Sample Captain, Sample Winger, Sample Ten, Sample Left Wing, Sample Striker</p><p><em>Subs:</em> Sample Sub, Sample Bench Keeper, Sample Bench Mid</p><p><em>On a real match day the official team sheet graphic from the club is embedded here.</em></p>`,
  );
  // 4. One reply per live event, plus a correction example.
  const events = normaliseEspnSummary(live).events.filter((e: EspnMatchEvent) =>
    ["goal", "penalty", "yellow", "red", "sub"].includes(e.kind),
  );
  for (const ev of events) {
    await add(`event: ${ev.kind} ${ev.clock ?? ""}`.trim(), buildEventBody(ev, fx, false));
  }
  if (events[0]) await add("event correction", buildEventBody(events[0], fx, true));
  // 5. Half-time summary.
  await add("half-time summary", buildHalfTimeBody(fx, ht));
  // 6. Full-time summary.
  await add("full-time summary", buildFullTimeBody(fx, ft));

  return { ok: true, topic: topic.title, posted };
}
