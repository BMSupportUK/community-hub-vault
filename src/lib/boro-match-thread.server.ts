// Auto-fills the Middlesbrough match day forum thread from the FotMob live feed:
//  1. A single pre-match FIRST REPLY (never a new topic) by "Boro Match Day
//     Author" ~24h before kick-off: competition, kick-off, venue, TV, league
//     positions, form, head-to-head, odds, referee and text line-ups.
//  2. A live block inside that same reply, refreshed in place during the game.
//  3. A half-time reply with the score, scorers and key stats.
// Injury / unavailable lists and "team news" placeholders are deliberately
// excluded — the team-sheet job posts the official graphic instead.

import { matchTopicToFixture, type FixtureLite } from "@/lib/boro-team-sheet.server";

import {
  normaliseEspnSummary,
  describeEspnEvent,
  PRIMARY_TEAM_STATS,
  type EspnMatchEvent,
} from "@/lib/boro-espn-events";

const PREVIEW_BEFORE_MS = 26 * 60 * 60 * 1000; // start ~24h+ before kick-off
const WINDOW_AFTER_MS = 5 * 60 * 60 * 1000;

export const LIVE_START = "<!--boro-live-start-->";
export const LIVE_END = "<!--boro-live-end-->";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function londonKickoff(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(d);
}

type SideInfo = {
  id: string | null;
  name: string;
  rank: string | null;
  points: string | null;
  form: string[];
  formLines: string[];
};

function standingsFor(json: any, teamId: string | null): { rank: string | null; points: string | null } {
  if (!teamId) return { rank: null, points: null };
  const groups: any[] = json?.standings?.groups ?? [];
  for (const g of groups) {
    for (const e of g?.standings?.entries ?? []) {
      if (String(e?.id ?? "") !== teamId) continue;
      const stat = (name: string) =>
        (e?.stats ?? []).find((s: any) => s?.name === name)?.displayValue ?? null;
      const played = Number((e?.stats ?? []).find((s: any) => s?.name === "gamesPlayed")?.value ?? 0);
      if (!played) return { rank: null, points: null };
      return { rank: stat("rank"), points: stat("points") };
    }
  }
  return { rank: null, points: null };
}

function lastFive(json: any, teamId: string | null): { form: string[]; lines: string[]; events: any[] } {
  const block = (json?.lastFiveGames ?? []).find((b: any) => String(b?.team?.id ?? "") === String(teamId ?? ""));
  const events: any[] = (block?.events ?? []).slice(0, 5);
  const form = events.map((e) => String(e?.gameResult ?? "").toUpperCase()).filter(Boolean);
  const lines = events.map((e) => {
    const opp = e?.opponent?.displayName ?? "Opponent";
    const at = e?.atVs === "@" ? "away at" : "home to";
    const score = e?.score ?? `${e?.homeTeamScore ?? ""}-${e?.awayTeamScore ?? ""}`;
    const res = String(e?.gameResult ?? "").toUpperCase();
    const comp = e?.leagueAbbreviation ?? e?.leagueName ?? "";
    return `${res} ${score} ${at} ${opp}${comp ? ` (${comp})` : ""}`;
  });
  return { form, lines, events };
}

function headToHead(json: any, homeId: string | null, awayId: string | null): string[] {
  const { events } = lastFive(json, homeId);
  return events
    .filter((e) => String(e?.opponent?.id ?? "") === String(awayId ?? ""))
    .map((e) => {
      const d = new Date(String(e?.gameDate ?? ""));
      const when = Number.isFinite(d.getTime())
        ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(d)
        : "";
      return `${when} — ${e?.score ?? ""} (${e?.leagueAbbreviation ?? e?.leagueName ?? ""})`;
    });
}

function oddsLine(json: any): string | null {
  const o = (json?.odds ?? [])[0];
  if (!o) return null;
  const bits: string[] = [];
  if (o.details) bits.push(String(o.details));
  const home = o?.homeTeamOdds?.moneyLine;
  const away = o?.awayTeamOdds?.moneyLine;
  const draw = o?.drawOdds?.moneyLine ?? o?.drawOdds;
  if (home != null && away != null) {
    bits.push(`home ${home > 0 ? `+${home}` : home}${draw != null && typeof draw === "number" ? ` / draw ${draw > 0 ? `+${draw}` : draw}` : ""} / away ${away > 0 ? `+${away}` : away}`);
  }
  if (o.overUnder != null) bits.push(`goals line ${o.overUnder}`);
  const provider = o?.provider?.name ? ` (${o.provider.name})` : "";
  return bits.length ? `${bits.join(" · ")}${provider}` : null;
}

function refereeOf(json: any): string | null {
  const officials: any[] = json?.gameInfo?.officials ?? [];
  const ref = officials.find((x: any) => /referee/i.test(String(x?.position?.displayName ?? x?.position?.name ?? "")));
  return (ref ?? officials[0])?.displayName ?? null;
}

function teamStatRows(json: any): Array<{ label: string; home: string; away: string }> {
  const teams: any[] = json?.boxscore?.teams ?? [];
  const home = teams.find((t: any) => t?.homeAway === "home") ?? teams[0];
  const away = teams.find((t: any) => t?.homeAway === "away") ?? teams[1];
  const get = (t: any, name: string) =>
    (t?.statistics ?? []).find((s: any) => s?.name === name)?.displayValue ?? null;
  const rows: Array<{ label: string; home: string; away: string }> = [];
  for (const s of PRIMARY_TEAM_STATS) {
    const h = get(home, s.name);
    const a = get(away, s.name);
    if (h == null && a == null) continue;
    rows.push({ label: s.label, home: String(h ?? "-"), away: String(a ?? "-") });
  }
  return rows;
}

function goalLines(events: EspnMatchEvent[]): string[] {
  return events
    .filter((e) => e.kind === "goal" || e.kind === "penalty" || e.kind === "own-goal")
    .map((e) => describeEspnEvent(e));
}

function statsTable(rows: Array<{ label: string; home: string; away: string }>, home: string, away: string): string {
  if (!rows.length) return "";
  const head = `<tr><th></th><th>${esc(home)}</th><th>${esc(away)}</th></tr>`;
  const body = rows
    .map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.home)}</td><td>${esc(r.away)}</td></tr>`)
    .join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** The refreshed-in-place live section of the pre-match reply. */
export function buildLiveBlock(fx: FixtureLite, json: any): string {
  const norm = normaliseEspnSummary(json);
  const home = norm.home ?? fx.home_team;
  const away = norm.away ?? fx.away_team;
  const comp = json?.header?.competitions?.[0];
  const scores = (comp?.competitors ?? []).reduce((acc: Record<string, string>, c: any) => {
    acc[c?.homeAway ?? ""] = String(c?.score ?? "0");
    return acc;
  }, {});
  const state = String(comp?.status?.type?.state ?? "pre");
  const parts: string[] = [LIVE_START];
  if (state === "pre") {
    parts.push(`<p><strong>Live updates</strong></p>`);
    parts.push(
      `<p>Kick-off ${esc(londonKickoff(fx.kickoff_at))} (UK). This section updates automatically with the score, scorers, cards and key stats once the game starts.</p>`,
    );
  } else {
    parts.push(
      `<p><strong>Live — ${esc(home)} ${esc(scores["home"] ?? "0")} - ${esc(scores["away"] ?? "0")} ${esc(away)}</strong>${norm.status ? ` <em>${esc(norm.status)}</em>` : ""}</p>`,
    );
    const goals = goalLines(norm.events);
    if (goals.length) {
      parts.push(`<p><strong>Goals</strong></p><ul>${goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`);
    }
    const rows = teamStatRows(json);
    if (rows.length) parts.push(`<p><strong>Key stats</strong></p>${statsTable(rows, home, away)}`);
  }
  parts.push(`<p><em>Updated ${esc(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date()))}</em></p>`);
  parts.push(LIVE_END);
  return parts.join("");
}

export const PRESSER_START = "<!--boro-presser-start-->";
export const PRESSER_END = "<!--boro-presser-end-->";

type PresserLite = { id: string; title: string; url: string } | null | undefined;

/** Press conference embed, or a bespoke fixture graphic when the club posted none. */
export function buildPresserBlock(fx: FixtureLite, json: any, presser: PresserLite): string {
  const norm = normaliseEspnSummary(json);
  const home = norm.home ?? fx.home_team;
  const away = norm.away ?? fx.away_team;
  const parts: string[] = [PRESSER_START];
  parts.push(`<p><strong>Press conference</strong></p>`);
  if (presser) {
    parts.push(
      `<div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:0.75rem 0;width:100%;border-radius:0.5rem;"><iframe src="https://www.youtube.com/embed/${esc(presser.id)}?rel=0&amp;playsinline=1" title="${esc(presser.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe></div>`,
    );
    parts.push(
      `<p><em>${esc(presser.title)} — Middlesbrough FC official channel.</em> <a href="${esc(presser.url)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></p>`,
    );
  } else {
    parts.push(fixtureGraphic(fx, json, home, away));
    parts.push(
      `<p><em>No press conference has been published by the club for this fixture yet. It will appear here automatically if one lands.</em></p>`,
    );
  }
  parts.push(PRESSER_END);
  return parts.join("");
}

/** Hand-built SVG fixture graphic used when there is no press conference video. */
function fixtureGraphic(fx: FixtureLite, json: any, home: string, away: string): string {
  const venue = json?.gameInfo?.venue?.fullName ?? null;
  const ko = new Date(fx.kickoff_at);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" }).format(ko);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(ko);
  const comp = fx.competition || "Fixture";
  const fit = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);
  return `<div style="margin:0.75rem 0;border-radius:0.75rem;overflow:hidden;border:1px solid rgba(225,27,34,0.35);">
<svg viewBox="0 0 1200 630" width="100%" height="auto" role="img" aria-label="${esc(`${home} versus ${away} — awaiting press conference`)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#05070c" stop-opacity="0.92"/>
      <stop offset="45%" stop-color="#05070c" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#05070c" stop-opacity="0.93"/>
    </linearGradient>
    <pattern id="stripes" width="26" height="26" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
      <rect width="26" height="26" fill="none"/><rect width="9" height="26" fill="#ffffff" fill-opacity="0.03"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="#0a0d14"/>
  <image href="/awaiting-press-conference.jpg" xlink:href="/awaiting-press-conference.jpg" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1200" height="630" fill="url(#scrim)"/>
  <rect width="1200" height="630" fill="url(#stripes)"/>
  <rect x="0" y="0" width="1200" height="6" fill="#E11B22"/>
  <g font-family="Helvetica, Arial, sans-serif" text-anchor="middle">
    <text x="600" y="80" fill="#E11B22" font-size="26" letter-spacing="9" font-weight="bold">AWAITING PRESS CONFERENCE</text>
    <text x="600" y="120" fill="#ffffff" fill-opacity="0.55" font-size="20" letter-spacing="4">${esc(comp.toUpperCase())}</text>
    <text x="600" y="212" fill="#ffffff" font-size="58" font-weight="bold">${esc(fit(home))}</text>
    <text x="600" y="262" fill="#E11B22" font-size="30" font-weight="bold" letter-spacing="6">V</text>
    <text x="600" y="322" fill="#ffffff" font-size="58" font-weight="bold">${esc(fit(away))}</text>
    <text x="600" y="556" fill="#ffffff" fill-opacity="0.85" font-size="26" letter-spacing="2">${esc(day)} · ${esc(time)} UK</text>
    ${venue ? `<text x="600" y="592" fill="#ffffff" fill-opacity="0.5" font-size="20">${esc(venue)}</text>` : ""}
  </g>
</svg>
</div>`;
}

export function buildPreviewBody(fx: FixtureLite, json: any, presser?: PresserLite): string {

  const norm = normaliseEspnSummary(json);
  const comp = json?.header?.competitions?.[0];
  const competitors: any[] = comp?.competitors ?? [];
  const homeC = competitors.find((c) => c?.homeAway === "home") ?? competitors[0];
  const awayC = competitors.find((c) => c?.homeAway === "away") ?? competitors[1];
  const homeId = homeC?.team?.id != null ? String(homeC.team.id) : null;
  const awayId = awayC?.team?.id != null ? String(awayC.team.id) : null;
  const home = norm.home ?? fx.home_team;
  const away = norm.away ?? fx.away_team;

  const sides: SideInfo[] = [
    { id: homeId, name: home, ...standingsFor(json, homeId), form: lastFive(json, homeId).form, formLines: lastFive(json, homeId).lines },
    { id: awayId, name: away, ...standingsFor(json, awayId), form: lastFive(json, awayId).form, formLines: lastFive(json, awayId).lines },
  ];

  const venue = json?.gameInfo?.venue?.fullName ?? null;
  const city = json?.gameInfo?.venue?.address?.city ?? null;
  const ref = refereeOf(json);
  const odds = oddsLine(json);
  const h2h = fotmobHeadToHead(json, home, away);
  const legacyH2h = h2h.lines.length ? [] : headToHead(json, homeId, awayId);

  const parts: string[] = [];
  parts.push(`<p><strong>Match preview — ${esc(home)} v ${esc(away)}</strong></p>`);
  const facts: string[] = [];
  facts.push(`<li><strong>Competition:</strong> ${esc(fx.competition || (comp?.groups?.name ?? "Fixture"))}</li>`);
  facts.push(`<li><strong>Kick-off:</strong> ${esc(londonKickoff(fx.kickoff_at))} (UK)</li>`);
  if (venue) facts.push(`<li><strong>Venue:</strong> ${esc(venue)}${city ? `, ${esc(city)}` : ""}</li>`);
  if (ref) facts.push(`<li><strong>Referee:</strong> ${esc(ref)}</li>`);
  if (odds) facts.push(`<li><strong>Odds:</strong> ${esc(odds)}</li>`);
  parts.push(`<ul>${facts.join("")}</ul>`);

  // Press conference lives in the thread's original post, not in this reply.


  const table = sides.filter((s) => s.rank);
  if (table.length) {
    parts.push(
      `<p><strong>League standing</strong></p><ul>${table
        .map((s) => `<li>${esc(s.name)}: ${esc(s.rank ?? "")}${s.points ? ` (${esc(s.points)} pts)` : ""}</li>`)
        .join("")}</ul>`,
    );
  }

  const withForm = sides.filter((s) => s.form.length);
  if (withForm.length) {
    parts.push(
      `<p><strong>Form (last 5)</strong></p>${withForm
        .map(
          (s) =>
            `<p>${esc(s.name)} — ${esc(s.form.join(" "))}</p><ul>${s.formLines
              .map((l) => `<li>${esc(l)}</li>`)
              .join("")}</ul>`,
        )
        .join("")}`,
    );
  }

  if (h2h.lines.length || legacyH2h.length) {
    const lines = h2h.lines.length ? h2h.lines : legacyH2h;
    parts.push(
      `<p><strong>Head to head</strong></p>${h2h.record ? `<p>${esc(h2h.record)}</p>` : ""}<ul>${lines
        .map((l) => `<li>${esc(l)}</li>`)
        .join("")}</ul>`,
    );
  }

  const prose = previewProse(fx, json, sides, h2h, { venue, city, ref });
  if (prose.length) {
    parts.push(`<p><strong>The preview</strong></p>${prose.map((p) => `<p>${esc(p)}</p>`).join("")}`);
  }


  parts.push(
    comp
      ? `<p><em>Auto-filled from the FotMob live feed.</em></p>`
      : `<p><em>Auto-filled from the fixture list — form, standings and odds will be added automatically once the match data is published.</em></p>`,
  );

  return parts.join("\n");
}


type H2H = { record: string | null; lines: string[]; homeWins: number; draws: number; awayWins: number };

/** Head-to-head straight from the FotMob h2h block (overall record + previous meetings). */
function fotmobHeadToHead(json: any, home: string, away: string): H2H {
  const block = json?.h2h ?? null;
  const summary = block?.summary ?? null;
  const homeWins = Number(summary?.homeWins ?? 0);
  const draws = Number(summary?.draws ?? 0);
  const awayWins = Number(summary?.awayWins ?? 0);
  const lines: string[] = (block?.matches ?? []).map((m: any) => {
    const d = m?.date ? new Date(String(m.date)) : null;
    const when =
      d && Number.isFinite(d.getTime())
        ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(d)
        : "";
    const comp = m?.competition ? ` (${m.competition})` : "";
    return `${when ? `${when} — ` : ""}${m?.home ?? ""} ${m?.score ?? ""} ${m?.away ?? ""}${comp}`.replace(/\s+/g, " ").trim();
  });
  const record =
    summary && homeWins + draws + awayWins > 0
      ? `Last ${homeWins + draws + awayWins} meetings: ${home} ${homeWins} win${homeWins === 1 ? "" : "s"}, ${draws} draw${draws === 1 ? "" : "s"}, ${away} ${awayWins} win${awayWins === 1 ? "" : "s"}.`
      : null;
  return { record, lines, homeWins, draws, awayWins };
}

function formWords(form: string[]): string {
  const w = form.filter((r) => r === "W").length;
  const d = form.filter((r) => r === "D").length;
  const l = form.filter((r) => r === "L").length;
  return `${w} win${w === 1 ? "" : "s"}, ${d} draw${d === 1 ? "" : "s"} and ${l} defeat${l === 1 ? "" : "s"}`;
}

/** A couple of readable paragraphs built from the same FotMob data as the bullet points. */
function previewProse(
  fx: FixtureLite,
  json: any,
  sides: SideInfo[],
  h2h: H2H,
  place: { venue: string | null; city: string | null; ref: string | null },
): string[] {
  const homeSide = sides[0];
  const awaySide = sides[1];
  if (!homeSide || !awaySide) return [];
  const paras: string[] = [];
  const competition = fx.competition || "the fixture list";
  const where = place.venue ? `${place.venue}${place.city ? `, ${place.city}` : ""}` : null;

  const standing = [homeSide, awaySide]
    .filter((s) => s.rank)
    .map((s) => `${s.name} sit ${s.rank}${s.points ? ` on ${s.points} points` : ""}`)
    .join(", while ");
  paras.push(
    `${homeSide.name} host ${awaySide.name} in ${competition} on ${londonKickoff(fx.kickoff_at)} UK time${where ? ` at ${where}` : ""}.` +
      (standing ? ` ${standing}.` : "") +
      (place.ref ? ` ${place.ref} takes charge.` : ""),
  );

  const formBits: string[] = [];
  const resultWord: Record<string, string> = { W: "win", D: "draw", L: "defeat" };
  for (const s of [homeSide, awaySide]) {
    if (!s.form.length) continue;
    const last = s.formLines[0]?.replace(/^([WDL])\s+/, (_m, r: string) => "").trim();
    const lastResult = resultWord[s.form[0] ?? ""] ?? null;
    formBits.push(
      `${s.name} arrive with ${formWords(s.form)} from their last ${s.form.length}${
        last && lastResult ? `, most recently a ${last.replace(/^(\S+)\s/, `$1 ${lastResult} `)}` : ""
      }`,
    );
  }
  if (formBits.length) paras.push(`${formBits.join(". ")}.`);

  const named = (t: string, teamId: string | null) => {
    const side = sides.find((s) => s.id && s.id === teamId);
    const withName = side && !t.toLowerCase().includes(side.name.toLowerCase()) ? `${side.name}: ${t}` : t;
    return /[.!?]$/.test(withName) ? withName : `${withName}.`;
  };
  const insights: string[] = (json?.insights ?? [])
    .filter((i: any) => String(i?.text ?? "").trim())
    .slice(0, 3)
    .map((i: any) => named(String(i.text).trim(), i?.teamId != null ? String(i.teamId) : null));
  const h2hBit = h2h.record
    ? `${h2h.record}${h2h.lines[0] ? ` The most recent was ${h2h.lines[0]}.` : ""}`
    : h2h.lines[0]
      ? `The sides last met in ${h2h.lines[0]}.`
      : "";
  if (h2hBit || insights.length) {
    paras.push(`${h2hBit}${h2hBit && insights.length ? " " : ""}${insights.join(" ")}`.trim());
  }

  paras.push(
    `Team news follows in the thread once the official line-ups drop, and the pinned live block above updates with goals, cards and key stats as the game goes on.`,
  );
  return paras.filter(Boolean);
}



export function buildHalfTimeBody(fx: FixtureLite, json: any): string {
  const norm = normaliseEspnSummary(json);
  const comp = json?.header?.competitions?.[0];
  const home = norm.home ?? fx.home_team;
  const away = norm.away ?? fx.away_team;
  const scores = (comp?.competitors ?? []).reduce((acc: Record<string, string>, c: any) => {
    acc[c?.homeAway ?? ""] = String(c?.score ?? "0");
    return acc;
  }, {});
  const goals = goalLines(norm.events.filter((e) => (e.period ?? 1) <= 1));
  const rows = teamStatRows(json);
  const parts = [
    `<p><strong>Half-time — ${esc(home)} ${esc(scores["home"] ?? "0")} - ${esc(scores["away"] ?? "0")} ${esc(away)}</strong></p>`,
  ];
  if (goals.length) parts.push(`<p><strong>First-half goals</strong></p><ul>${goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`);
  if (rows.length) parts.push(`<p><strong>Half-time stats</strong></p>${statsTable(rows, home, away)}`);
  return parts.join("\n");
}

function replaceLiveBlock(body: string, block: string): string {
  const start = body.indexOf(LIVE_START);
  const end = body.indexOf(LIVE_END);
  if (start === -1 || end === -1) return `${body}\n${block}`;
  return `${body.slice(0, start)}${block}${body.slice(end + LIVE_END.length)}`;
}

export function buildFullTimeBody(fx: FixtureLite, json: any): string {
  const norm = normaliseEspnSummary(json);
  const comp = json?.header?.competitions?.[0];
  const home = norm.home ?? fx.home_team;
  const away = norm.away ?? fx.away_team;
  const scores = (comp?.competitors ?? []).reduce((acc: Record<string, string>, c: any) => {
    acc[c?.homeAway ?? ""] = String(c?.score ?? "0");
    return acc;
  }, {});
  const goals = goalLines(norm.events);
  const cards = norm.events
    .filter((e) => e.kind === "yellow" || e.kind === "red")
    .map((e) => describeEspnEvent(e));
  const rows = teamStatRows(json);
  const parts = [
    `<p><strong>Full-time — ${esc(home)} ${esc(scores["home"] ?? "0")} - ${esc(scores["away"] ?? "0")} ${esc(away)}</strong></p>`,
  ];
  const pens = norm.events.filter((e) => e.kind === "shootout-scored" || e.kind === "shootout-missed");
  if (pens.length) {
    parts.push(
      `<p><strong>Penalty shootout</strong></p><ul>${pens.map((e) => `<li>${esc(describeEspnEvent(e))}</li>`).join("")}</ul>`,
    );
  }
  if (goals.length) parts.push(`<p><strong>Goals</strong></p><ul>${goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`);
  if (cards.length) parts.push(`<p><strong>Cards</strong></p><ul>${cards.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`);
  if (rows.length) parts.push(`<p><strong>Full-time stats</strong></p>${statsTable(rows, home, away)}`);
  return parts.join("\n");
}

/** Strip a legacy inline live block out of the preview reply. */
/** Insert or refresh the press conference block inside an existing preview post. */
function upsertPresserBlock(body: string, block: string): string {
  const start = body.indexOf(PRESSER_START);
  const end = body.indexOf(PRESSER_END);
  if (start !== -1 && end !== -1) {
    const current = body.slice(start, end + PRESSER_END.length);
    // Keep an existing video block; never downgrade it to the "no presser" graphic.
    if (/<iframe/i.test(current) && !/<iframe/i.test(block)) return body;
    return `${body.slice(0, start)}${block}${body.slice(end + PRESSER_END.length)}`;
  }
  // Marker comments can be stripped by the editor — never stack a second video.
  if (/youtube(?:-nocookie)?\.com\/embed/i.test(body)) return body;
  // Older previews have no block yet — drop it in after the facts list.
  const anchor = body.indexOf("</ul>");
  if (anchor === -1) return `${body}\n${block}`;
  return `${body.slice(0, anchor + 5)}\n${block}${body.slice(anchor + 5)}`;
}

/** Remove a press conference block from a body (it belongs in the original post). */
function stripPresserBlock(body: string): string {
  const start = body.indexOf(PRESSER_START);
  const end = body.indexOf(PRESSER_END);
  if (start === -1 || end === -1) return body;
  return `${body.slice(0, start)}${body.slice(end + PRESSER_END.length)}`;
}

/** Short club names used in match day thread titles (house format). */
const TITLE_SHORT_NAMES: Record<string, string> = {
  "queens park rangers": "QPR",
  "west bromwich albion": "West Brom",
  "sheffield wednesday": "Sheffield Weds",
  "wolverhampton wanderers": "Wolves",
  "brighton & hove albion": "Brighton",
  "nottingham forest": "Nottm Forest",
};

function titleTeam(name: string): string {
  return TITLE_SHORT_NAMES[name.trim().toLowerCase()] ?? name.trim();
}

/** "QPR v Middlesbrough 05-09-26" — the format every match day thread uses. */
export function matchThreadTitle(fx: FixtureLite): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(fx.kickoff_at));
  return `${titleTeam(fx.home_team)} v ${titleTeam(fx.away_team)} ${parts.replace(/\//g, "-")}`;
}

/** Open a match day thread for a fixture, with the standard first post. */
async function createMatchTopic(
  supabaseAdmin: any,
  boardId: string,
  authorId: string,
  fx: FixtureLite,
): Promise<{ id: string; title: string; author_id: string } | null> {
  const title = matchThreadTitle(fx);
  const { data: topic, error } = await supabaseAdmin
    .from("forum_topics")
    .insert({ board_id: boardId, author_id: authorId, title })
    .select("id, title, author_id")
    .single();
  if (error || !topic) return null;
  const { error: postErr } = await supabaseAdmin.from("forum_posts").insert({
    topic_id: topic.id,
    author_id: authorId,
    body: `<div data-fz-prepared="1">Awaiting Press Conference</div>`,
    is_op: true,
  });
  if (postErr) return topic as { id: string; title: string; author_id: string };
  return topic as { id: string; title: string; author_id: string };
}




function stripLiveBlock(body: string): string {

  const start = body.indexOf(LIVE_START);
  const end = body.indexOf(LIVE_END);
  if (start === -1 || end === -1) return body;
  return `${body.slice(0, start)}${body.slice(end + LIVE_END.length)}`;
}

export function isHalfTime(json: any): boolean {
  const st = json?.header?.competitions?.[0]?.status;
  const detail = [st?.type?.name, st?.type?.shortDetail, st?.type?.detail, st?.type?.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /half\s*time|halftime|\bht\b/.test(detail);
}

export function isFullTime(json: any): boolean {
  const st = json?.header?.competitions?.[0]?.status;
  const state = String(st?.type?.state ?? "").toLowerCase();
  const detail = String(st?.type?.shortDetail ?? st?.type?.detail ?? st?.type?.description ?? "").toLowerCase();
  return state === "post" || st?.type?.completed === true || /full\s*time|\bft\b|final/.test(detail);
}

export type ThreadSyncResult = {
  ok: boolean;
  fixture?: string;
  topic?: string | null;
  status?: string | null;
  previewPosted: boolean;
  liveUpdated: boolean;
  halfTimePosted: boolean;
  fullTimePosted: boolean;
  skipped: string[];
  error?: string;
};

export async function syncBoroMatchThread(opts?: { ignoreWindow?: boolean }): Promise<ThreadSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getMatchDayAuthorId } = await import("@/lib/boro-bot-author.server");
  const skipped: string[] = [];
  const base: ThreadSyncResult = {
    ok: true,
    previewPosted: false,
    liveUpdated: false,
    halfTimePosted: false,
    fullTimePosted: false,
    skipped,
  };
  const now = Date.now();

  const { data: fixtures, error: fxErr } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id, home_team, away_team, kickoff_at, competition")
    .gte("kickoff_at", new Date(now - 12 * 60 * 60 * 1000).toISOString())
    .lte("kickoff_at", new Date(now + 48 * 60 * 60 * 1000).toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(10);
  if (fxErr) return { ...base, ok: false, error: fxErr.message };

  const rows = (fixtures ?? []) as FixtureLite[];
  const fx = rows.find((row) => {
    const ko = Date.parse(row.kickoff_at);
    if (!Number.isFinite(ko)) return false;
    if (opts?.ignoreWindow) return true;
    return now >= ko - PREVIEW_BEFORE_MS && now <= ko + WINDOW_AFTER_MS;
  });
  if (!fx) return { ...base, skipped: ["no fixture inside the preview window"] };
  const label = `${fx.home_team} v ${fx.away_team}`;

  const { data: board } = await supabaseAdmin
    .from("forum_boards")
    .select("id")
    .eq("slug", "match-day")
    .maybeSingle();
  if (!board?.id) return { ...base, fixture: label, skipped: ["match day board not found"] };

  const authorId = (await getMatchDayAuthorId()) ?? null;

  const { data: topics } = await supabaseAdmin
    .from("forum_topics")
    .select("id, title, created_at, author_id")
    .eq("board_id", board.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const existingTopics = (topics ?? []) as Array<{ id: string; title: string; created_at: string; author_id: string }>;
  let topic = matchTopicToFixture(existingTopics, fx);
  // No thread yet (the previous game has finished and this is the next fixture):
  // open one automatically in the house format so the preview can post into it.
  if (!topic && authorId) {
    topic = await createMatchTopic(supabaseAdmin, board.id, authorId, fx);
    if (!topic) skipped.push("could not open a match day thread automatically");
  }
  if (!topic) return { ...base, fixture: label, topic: null, skipped: ["no match day thread for this fixture yet"] };


  // FotMob is the only live-data source. It is reachable from the server, so no
  // browser relay is needed and the thread can refresh in real time. Live data
  // is a bonus, not a requirement: the preview must still go out ~24h before
  // kick-off from our own fixture list when FotMob has no listing yet.
  const { fetchFotmobSummary } = await import("@/lib/fotmob-boro.server");
  let json: any = await fetchFotmobSummary({ home: fx.home_team, away: fx.away_team, kickoff: fx.kickoff_at });

  // A response is only useful if it actually carries the competition payload.
  const usable = (candidate: any) =>
    Array.isArray(candidate?.header?.competitions) && candidate.header.competitions.length > 0;

  const hasLiveData = usable(json);
  if (!hasLiveData) {
    skipped.push("FotMob live summary unavailable — posted fixture-only preview");
    json = {};
  }
  const status = hasLiveData ? normaliseEspnSummary(json).status : null;



  const postAuthorId = authorId ?? topic.author_id;

  // Official Middlesbrough FC press conference video for this fixture (if any).
  const { findPressConference } = await import("@/lib/boro-press-conference.server");
  const presser = await findPressConference(fx).catch(() => null);
  if (!presser) skipped.push("no press conference video found — fixture graphic used");

  // The press conference belongs in the thread's original post (Original Post tab).
  {
    const { data: opPost } = await supabaseAdmin
      .from("forum_posts")
      .select("id, body")
      .eq("topic_id", topic.id)
      .eq("is_op", true)
      .maybeSingle();
    if (opPost?.id) {
      const block = buildPresserBlock(fx, json, presser);
      const nextBody = upsertPresserBlock(opPost.body ?? "", block);

      if (nextBody !== opPost.body) {
        const { error: opErr } = await supabaseAdmin
          .from("forum_posts")
          .update({ body: nextBody })
          .eq("id", opPost.id);
        if (opErr) skipped.push(`original post refresh failed: ${opErr.message}`);
      }
    }
  }




  const { data: logged } = await supabaseAdmin
    .from("boro_match_event_posts")
    .select("id, event_key, post_id, fingerprint, revision")
    .eq("fixture_id", fx.id)
    .in("event_key", ["preview", "halftime", "fulltime", "live"]);
  const byKey = new Map(
    ((logged ?? []) as Array<{ id: string; event_key: string; post_id: string; fingerprint: string; revision: number }>).map(
      (r) => [r.event_key, r],
    ),
  );

  let previewPosted = false;
  let liveUpdated = false;
  let halfTimePosted = false;
  let fullTimePosted = false;

  const preview = byKey.get("preview");
  if (!preview) {
    const body = buildPreviewBody(fx, json, presser);
    const { data: post, error: postErr } = await supabaseAdmin
      .from("forum_posts")
      .insert({ topic_id: topic.id, author_id: postAuthorId, body })
      .select("id")
      .single();
    if (postErr) skipped.push(`preview post failed: ${postErr.message}`);
    else {
      previewPosted = true;
      const { error: logErr } = await supabaseAdmin.from("boro_match_event_posts").insert({
        fixture_id: fx.id,
        topic_id: topic.id,
        post_id: post.id,
        event_key: "preview",
        kind: "preview",
        clock: null,
        summary: `Match preview — ${label}`,
        fingerprint: hasLiveData ? "preview" : "preview-basic",
        revision: 0,
      });
      if (logErr) skipped.push(`preview log failed: ${logErr.message}`);
    }
  } else {
    // Strip any legacy inline live block, plus legacy XI / TV lines
    // (line-ups arrive later via the official team-sheet job).
    const { data: existing } = await supabaseAdmin
      .from("forum_posts")
      .select("body")
      .eq("id", preview.post_id)
      .maybeSingle();
    if (existing?.body) {
      const legacy =
        /XI<\/strong>/.test(existing.body) ||
        /TV \/ stream/.test(existing.body) ||
        /Our score prediction/.test(existing.body) ||
        !/The preview<\/strong>/.test(existing.body);
      // A fixture-only preview gets upgraded in place as soon as FotMob lists the game.
      // Detect it from the body too, so a mis-stamped fingerprint can't lock the
      // preview into the stripped-back version forever.
      const basic =
        preview.fingerprint === "preview-basic" ||
        /Auto-filled from the fixture list/.test(existing.body) ||
        !/Form \(last 5\)/.test(existing.body);
      const upgrade = hasLiveData && basic;
      const rebuilt =
        legacy || upgrade
          ? buildPreviewBody(fx, json, presser)
          : stripPresserBlock(stripLiveBlock(existing.body));

      if (rebuilt !== existing.body) {
        const { error: upErr } = await supabaseAdmin
          .from("forum_posts")
          .update({ body: rebuilt })
          .eq("id", preview.post_id);
        if (upErr) skipped.push(`preview refresh failed: ${upErr.message}`);
      }
      if (upgrade) {
        await supabaseAdmin
          .from("boro_match_event_posts")
          .update({ fingerprint: "preview" })
          .eq("id", preview.id);
      }
    }

  }

  // Pinned live block reply — always sits at the top of the replies, refreshed in place.
  const live = byKey.get("live");
  const liveBody = `<p><strong>📌 Live match block — ${esc(label)}</strong></p>\n${buildLiveBlock(fx, json)}`;
  if (!live) {
    const { data: post, error: postErr } = await supabaseAdmin
      .from("forum_posts")
      .insert({ topic_id: topic.id, author_id: postAuthorId, body: liveBody, is_pinned: true })
      .select("id")
      .single();
    if (postErr) skipped.push(`live post failed: ${postErr.message}`);
    else {
      liveUpdated = true;
      const { error: logErr } = await supabaseAdmin.from("boro_match_event_posts").insert({
        fixture_id: fx.id,
        topic_id: topic.id,
        post_id: post.id,
        event_key: "live",
        kind: "live",
        clock: null,
        summary: `Live block — ${label}`,
        fingerprint: "live",
        revision: 0,
      });
      if (logErr) skipped.push(`live log failed: ${logErr.message}`);
    }
  } else {
    const { data: existingLive } = await supabaseAdmin
      .from("forum_posts")
      .select("body, is_pinned")
      .eq("id", live.post_id)
      .maybeSingle();
    const next = existingLive?.body ? replaceLiveBlock(existingLive.body, buildLiveBlock(fx, json)) : liveBody;
    if (next !== existingLive?.body || existingLive?.is_pinned !== true) {
      const { error: upErr } = await supabaseAdmin
        .from("forum_posts")
        .update({ body: next, is_pinned: true })
        .eq("id", live.post_id);
      if (upErr) skipped.push(`live refresh failed: ${upErr.message}`);
      else liveUpdated = true;
    }
  }

  // Half-time and full-time stat round-ups are no longer posted as replies —
  // the pinned live block already carries the score and key stats.

  // As soon as this game is over, open the thread for the next fixture so it is
  // ready and waiting (the preview then fills it ~24h before kick-off).
  if (authorId && isFullTime(json)) {
    const { data: upcoming } = await supabaseAdmin
      .from("boro_fixtures")
      .select("id, home_team, away_team, kickoff_at, competition")
      .gt("kickoff_at", new Date(Date.parse(fx.kickoff_at) + 3 * 60 * 60 * 1000).toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(1);
    const next = (upcoming ?? [])[0] as FixtureLite | undefined;
    if (next) {
      const { data: laterTopics } = await supabaseAdmin
        .from("forum_topics")
        .select("id, title, created_at, author_id")
        .eq("board_id", board.id)
        .order("created_at", { ascending: false })
        .limit(40);
      const already = matchTopicToFixture(
        (laterTopics ?? []) as Array<{ id: string; title: string; created_at: string; author_id: string }>,
        next,
      );
      if (!already) {
        const created = await createMatchTopic(supabaseAdmin, board.id, authorId, next);
        skipped.push(
          created ? `opened next match day thread: ${created.title}` : "could not open next match day thread",
        );
      }
    }
  }




  return {
    ...base,
    fixture: label,
    topic: topic.title,
    status,
    previewPosted,
    liveUpdated,
    halfTimePosted,
    fullTimePosted,
  };
}