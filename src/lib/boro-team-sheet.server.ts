// Reads Middlesbrough's official X/Twitter timeline and posts the first-team
// line-up graphic into the match day forum thread for the fixture.
//
// Facebook is login-walled for automated fetches, so we read the same team
// sheet graphic from the official X account via X's public syndication feed
// (the same source `src/routes/api/public/tweet.ts` already relies on).

const HANDLE = "Boro";
const TIMELINE_URL = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${HANDLE}`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000; // start watching 3h before KO
const WINDOW_AFTER_MS = 15 * 60 * 1000; // stop 15m after KO

export type TeamSheetHit = {
  tweetId: string;
  text: string;
  images: string[];
  createdAtMs: number;
  url: string;
};

// X posts team news with "mathematical sans-serif" unicode letters, which
// breaks plain keyword matching — fold them back to ASCII first.
const FANCY_RANGES: Array<[number, number, string]> = [
  [0x1d400, 0x1d419, "A"], [0x1d41a, 0x1d433, "a"],
  [0x1d434, 0x1d44d, "A"], [0x1d44e, 0x1d467, "a"],
  [0x1d468, 0x1d481, "A"], [0x1d482, 0x1d49b, "a"],
  [0x1d5a0, 0x1d5b9, "A"], [0x1d5ba, 0x1d5d3, "a"],
  [0x1d5d4, 0x1d5ed, "A"], [0x1d5ee, 0x1d607, "a"],
  [0x1d608, 0x1d621, "A"], [0x1d622, 0x1d63b, "a"],
  [0x1d670, 0x1d689, "A"], [0x1d68a, 0x1d6a3, "a"],
];

export function normalizeFancyText(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    let mapped = ch;
    for (const [start, end, base] of FANCY_RANGES) {
      if (cp >= start && cp <= end) {
        mapped = String.fromCharCode(base.charCodeAt(0) + (cp - start));
        break;
      }
    }
    out += mapped;
  }
  return out;
}

const TEAM_SHEET_PATTERNS: RegExp[] = [
  /\byour\s+boro\s+team\b/i,
  // Covers "Your opening day Boro 🔒", "Your Boro for tonight", etc.
  /\byour\s+(?:[a-z0-9'’-]+\s+){0,4}boro\b/i,
  // The club also announces the XI as "Kim Hellberg's Boro".
  /\b[a-z]+(?:\s+[a-z]+){0,3}['’]s\s+boro\b/i,
  /\bteam\s*news\b/i,
  /\bline[\s-]?up\b/i,
  /\bstarting\s+xi\b/i,
  /\bhere'?s\s+how\s+we\s+(?:line|lineup|line up)\b/i,
  /\bteam\s*sheet\b/i,
  /\bxi\s*[:|\u26bd]/i,
  // "Our XI at Turf Moor", "The XI to face Burnley", "Tonight's XI".
  /\b(?:our|the|this|tonight'?s|today'?s|toda?y'?s)\s+(?:[a-z0-9'’-]+\s+){0,3}xi\b/i,
  /\bxi\s+(?:at|v|vs|versus|to\s+face|in|for)\b/i,
  // "Tonight's Boro side", "Today's side to face …"
  /\b(?:tonight'?s|today'?s|this\s+(?:afternoon|evening|lunchtime)'?s)\s+(?:[a-z0-9'’-]+\s+){0,3}(?:side|team|eleven)\b/i,
];

const NEGATIVE_PATTERNS: RegExp[] = [
  /\bunder[\s-]?21s?\b/i,
  /\bu21\b/i,
  /\bu18\b/i,
  /\bacademy\b/i,
  /\bwomen'?s\b/i,
];

export function isTeamSheetText(rawText: string): boolean {
  const text = normalizeFancyText(rawText);
  if (NEGATIVE_PATTERNS.some((re) => re.test(text))) return false;
  return TEAM_SHEET_PATTERNS.some((re) => re.test(text));
}

/**
 * The club retweets the opposition line-up ("RT @BurnleyOfficial: Tonight's
 * Burnley side 📋"), which is the second half of the match day "Teams" tab.
 */
export function isOpponentTeamSheetText(rawText: string, opponentName: string): boolean {
  const text = normalizeFancyText(rawText).toLowerCase();
  if (NEGATIVE_PATTERNS.some((re) => re.test(text))) return false;
  const tokens = opponentTokens(opponentName);
  const named = tokens.some((w) => text.includes(w)) || tokens.length === 0;
  if (!named) return false;
  return /\b(side|xi|team\s*news|team\s*sheet|line[\s-]?up|eleven)\b/.test(text);
}


function normalizeImageUrl(raw: string): string | null {
  try {
    const url = new URL(String(raw).trim().replace(/:(?:small|medium|large|orig)$/i, ""));
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com") return null;
    url.searchParams.set("name", "large");
    return url.toString();
  } catch {
    return null;
  }
}

function imagesFromTweet(tweet: Record<string, unknown>): string[] {
  const out: string[] = [];
  const photos = (tweet.photos as Array<Record<string, unknown>> | undefined) ?? [];
  for (const p of photos) {
    const u = normalizeImageUrl(String(p.url ?? ""));
    if (u && !out.includes(u)) out.push(u);
  }
  const media = (tweet.mediaDetails as Array<Record<string, unknown>> | undefined) ?? [];
  for (const m of media) {
    if (m.type && m.type !== "photo") continue;
    const u = normalizeImageUrl(String(m.media_url_https ?? ""));
    if (u && !out.includes(u)) out.push(u);
  }
  // The syndication timeline puts media under entities/extended_entities.
  const entityMedia = [
    ...(((tweet.extended_entities as Record<string, unknown> | undefined)?.media as Array<Record<string, unknown>>) ?? []),
    ...(((tweet.entities as Record<string, unknown> | undefined)?.media as Array<Record<string, unknown>>) ?? []),
  ];
  for (const m of entityMedia) {
    if (m.type && m.type !== "photo") continue;
    const u = normalizeImageUrl(String(m.media_url_https ?? ""));
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * X refuses a lot of serverless egress outright, so the deployed site sees an
 * empty timeline while local dev works. When the direct read fails we retry the
 * same page through read-only text mirrors that hand back the untouched HTML.
 */
async function fetchTimelineHtml(handle: string): Promise<string | null> {
  const timelineUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`;
  const targets: Array<{ url: string; headers: Record<string, string> }> = [
    { url: timelineUrl, headers: { accept: "text/html", "user-agent": UA, "accept-language": "en-GB,en;q=0.9" } },
    {
      url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(timelineUrl)}`,
      headers: { accept: "text/html" },
    },
    { url: `https://proxy.cors.sh/${timelineUrl}`, headers: { accept: "text/html" } },
  ];
  for (const target of targets) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(target.url, { headers: target.headers, signal: controller.signal });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.includes("__NEXT_DATA__")) return html;
    } catch {
      // try the next mirror
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function fetchOfficialTimeline(handle: string = HANDLE): Promise<TeamSheetHit[]> {
  try {
    const html = await fetchTimelineHtml(handle);
    if (!html) return [];
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match?.[1]) return [];
    const json = JSON.parse(match[1]) as {
      props?: { pageProps?: { timeline?: { entries?: Array<{ content?: { tweet?: Record<string, unknown> } }> } } };
    };
    const entries = json.props?.pageProps?.timeline?.entries ?? [];
    const hits: TeamSheetHit[] = [];
    for (const entry of entries) {
      const tweet = entry.content?.tweet;
      if (!tweet) continue;
      const id = String(tweet.id_str ?? "");
      if (!id) continue;
      const created = Date.parse(String(tweet.created_at ?? ""));
      hits.push({
        tweetId: id,
        text: String(tweet.full_text ?? tweet.text ?? ""),
        images: imagesFromTweet(tweet),
        createdAtMs: Number.isFinite(created) ? created : 0,
        url: `https://x.com/${handle}/status/${id}`,
      });
    }
    return hits;
  } catch {
    return [];
  }
}

/**
 * Boro does not always retweet the opposition XI, so we read the opponent's own
 * official account as well. Handles are mapped for the clubs we meet; anything
 * missing falls back to sensible guesses built from the club name.
 */
const CLUB_HANDLES: Record<string, string[]> = {
  "queens park rangers": ["QPR"],
  burnley: ["BurnleyOfficial"],
  "west bromwich albion": ["WBA"],
  "doncaster rovers": ["drfc_official"],
  "swansea city": ["SwansOfficial"],
  "sheffield united": ["SheffieldUnited"],
  "sheffield wednesday": ["swfc"],
  "leicester city": ["LCFC"],
  southampton: ["SouthamptonFC"],
  ipswich: ["IpswichTown"],
  "ipswich town": ["IpswichTown"],
  norwich: ["NorwichCityFC"],
  "norwich city": ["NorwichCityFC"],
  watford: ["WatfordFC"],
  millwall: ["MillwallFC"],
  "coventry city": ["Coventry_City"],
  "bristol city": ["BristolCity"],
  "hull city": ["HullCity"],
  "preston north end": ["pnefc"],
  "stoke city": ["stokecity"],
  "blackburn rovers": ["Rovers"],
  "birmingham city": ["BCFC"],
  "charlton athletic": ["CAFCofficial"],
  "derby county": ["dcfcofficial"],
  "oxford united": ["OUFCOfficial"],
  portsmouth: ["Pompey"],
  wrexham: ["Wrexham_AFC"],
  "leeds united": ["LUFC"],
  sunderland: ["SunderlandAFC"],
  "cardiff city": ["CardiffCityFC"],
  "plymouth argyle": ["Only1Argyle"],
  "luton town": ["LutonTown"],
  "lincoln city": ["LincolnCity_FC"],
};

export function opponentHandles(name: string): string[] {
  const key = name.toLowerCase().replace(/\s+/g, " ").trim();
  const mapped = CLUB_HANDLES[key] ?? CLUB_HANDLES[key.replace(/\b(fc|afc)\b/g, "").trim()];
  if (mapped) return mapped;
  const words = key.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const guesses = new Set<string>();
  const acronym = words.map((w) => w[0]).join("");
  if (acronym.length >= 3) guesses.add(acronym.toUpperCase());
  guesses.add(`${words.join("")}FC`);
  guesses.add(`${words[0]}FC`);
  return [...guesses];
}

/** The opponent's own account speaks in the first person about their XI. */
export function isOwnTeamSheetText(rawText: string): boolean {
  const text = normalizeFancyText(rawText);
  if (NEGATIVE_PATTERNS.some((re) => re.test(text))) return false;
  return /\bteam\s*news\b|\bline[\s-]?ups?\b|\bstarting\s+(?:xi|eleven|line)\b|\bteam\s*sheet\b|\bour\s+xi\b|\b(?:today'?s|tonight'?s|this\s+afternoon'?s)\s+(?:team|side|xi)\b|\bhow\s+we\s+line\s*up\b|\bteam\s+to\s+face\b/i.test(
    text,
  );
}

/** Reads the opposition XI graphic straight from their official account. */
export async function fetchOpponentTeamSheets(
  opponentName: string,
  kickoffMs: number,
): Promise<TeamSheetHit[]> {
  const from = kickoffMs - WINDOW_BEFORE_MS;
  const to = kickoffMs + WINDOW_AFTER_MS;
  for (const handle of opponentHandles(opponentName)) {
    const hits = await fetchOfficialTimeline(handle).catch(() => []);
    const matched = hits
      .filter((h) => h.images.length > 0 && h.createdAtMs >= from && h.createdAtMs <= to)
      .filter((h) => !/^RT\s+@/i.test(h.text))
      .filter((h) => isOwnTeamSheetText(h.text))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    if (matched.length > 0) return matched;
  }
  return [];
}


export function pickTeamSheetPosts(
  hits: TeamSheetHit[],
  kickoffMs: number,
  opponentName?: string,
): Array<TeamSheetHit & { side: "boro" | "opponent" }> {
  const from = kickoffMs - WINDOW_BEFORE_MS;
  const to = kickoffMs + WINDOW_AFTER_MS;
  return hits
    .filter((h) => h.images.length > 0 && h.createdAtMs >= from && h.createdAtMs <= to)
    .map((h) => {
      const text = normalizeFancyText(h.text);
      // Boro's own graphic always names the club or speaks in the first person.
      const boroFirstPerson = /\bboro\b|\bour\b|\bwe\b|\bus\b/i.test(text.replace(/^RT\s+@\w+:\s*/i, "x "));
      if (!boroFirstPerson && opponentName && isOpponentTeamSheetText(text, opponentName)) {
        return { ...h, side: "opponent" as const };
      }
      if (isTeamSheetText(text)) return { ...h, side: "boro" as const };
      if (opponentName && isOpponentTeamSheetText(text, opponentName)) {
        return { ...h, side: "opponent" as const };
      }
      return null;
    })


    .filter((h): h is TeamSheetHit & { side: "boro" | "opponent" } => h !== null)
    // Boro's XI is always posted first, then the opposition graphic.
    .sort(
      (a, b) =>
        (a.side === "boro" ? 0 : 1) - (b.side === "boro" ? 0 : 1) || a.createdAtMs - b.createdAtMs,
    );
}


export type FixtureLite = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  competition: string;
};

const BORO_RE = /\bmiddles(?:brough|borough)\b|\bboro\b|\bmfc\b/i;

function opponentOf(fx: FixtureLite): string {
  return BORO_RE.test(fx.home_team) ? fx.away_team : fx.home_team;
}

function opponentTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|afc|cf|the)\b/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !["united", "city", "town", "rovers", "county", "albion", "athletic", "wanderers"].includes(w),
    );
}

// Titles can be "Boro v Lincoln City …" (home) or "Lincoln City v Boro …" (away).
function titleMentionsBothSides(title: string, fx: FixtureLite): boolean {
  const clean = title.toLowerCase();
  if (!BORO_RE.test(clean)) return false;
  const tokens = opponentTokens(opponentOf(fx));
  if (tokens.length === 0) return false;
  return tokens.some((w) => clean.includes(w));
}

function dateKeys(iso: string): string[] {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return [`${dd}-${mm}-${yy}`, `${dd}/${mm}/${yy}`, `${dd}.${mm}.${yy}`];
}

// Match day threads are titled like "Boro v Lincoln City 14-08-26 KO 15:00".
export function matchTopicToFixture(
  topics: Array<{ id: string; title: string; created_at: string; author_id: string }>,
  fx: FixtureLite,
): { id: string; title: string; author_id: string } | null {
  const keys = dateKeys(fx.kickoff_at);
  const koMs = Date.parse(fx.kickoff_at);

  // Strongest signal: correct date AND both teams named, in either order.
  const byDateAndTeams = topics.find(
    (t) => keys.some((k) => t.title.includes(k)) && titleMentionsBothSides(t.title, fx),
  );
  if (byDateAndTeams) return byDateAndTeams;

  const byDate = topics.find((t) => keys.some((k) => t.title.includes(k)));
  if (byDate) return byDate;

  const candidates = topics.filter((t) => {
    const created = Date.parse(t.created_at);
    return created <= koMs + WINDOW_AFTER_MS && koMs - created <= 8 * 24 * 60 * 60 * 1000;
  });
  const bothSides = candidates.find((t) => titleMentionsBothSides(t.title, fx));
  if (bothSides) return bothSides;

  const words = opponentTokens(opponentOf(fx));
  return candidates.find((t) => words.some((w) => t.title.toLowerCase().includes(w))) ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildTeamSheetBody(opts: {
  imageUrl: string;
  caption?: string | null;
  sourceUrl?: string | null;
  isUpdate: boolean;
  teamLabel?: string | null;
}): string {
  const team = (opts.teamLabel ?? "").trim();
  const heading = opts.isUpdate
    ? `Team news — updated ${team ? `${team} ` : "official "}line-up`
    : `Team news — ${team ? `${team} ` : "official "}line-up`;
  const caption = (opts.caption ?? "").trim();
  const parts = [
    `<p><strong>${heading}</strong></p>`,
    `<p><img src="${escapeHtml(opts.imageUrl)}" alt="${escapeHtml(team || "Middlesbrough")} team sheet" /></p>`,
  ];

  if (caption) parts.push(`<p>${escapeHtml(caption).replace(/\n+/g, "<br />")}</p>`);
  if (opts.sourceUrl) {
    parts.push(
      `<p><a href="${escapeHtml(opts.sourceUrl)}" target="_blank" rel="noopener noreferrer">View the official post</a></p>`,
    );
  }
  return parts.join("\n");
}

export type SyncResult = {
  ok: boolean;
  fixture?: string;
  topic?: string | null;
  posted: number;
  skipped: string[];
  error?: string;
};

export async function syncBoroTeamSheet(opts?: { ignoreWindow?: boolean }): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getMatchDayAuthorId } = await import("@/lib/boro-bot-author.server");
  const skipped: string[] = [];
  const now = Date.now();

  const { data: fixtures, error: fxErr } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id, home_team, away_team, kickoff_at, competition")
    .gte("kickoff_at", new Date(now - 6 * 60 * 60 * 1000).toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(10);
  if (fxErr) return { ok: false, posted: 0, skipped, error: fxErr.message };

  const rows = (fixtures ?? []) as FixtureLite[];
  const fx = rows.find((row) => {
    const ko = Date.parse(row.kickoff_at);
    if (!Number.isFinite(ko)) return false;
    if (opts?.ignoreWindow) return true;
    return now >= ko - WINDOW_BEFORE_MS && now <= ko + WINDOW_AFTER_MS;
  });
  if (!fx) return { ok: true, posted: 0, skipped: ["no fixture inside the team-news window"] };

  const label = `${fx.home_team} v ${fx.away_team}`;

  const { data: board } = await supabaseAdmin
    .from("forum_boards")
    .select("id")
    .eq("slug", "match-day")
    .maybeSingle();
  if (!board?.id) return { ok: true, fixture: label, posted: 0, skipped: ["match day board not found"] };

  const { data: topics } = await supabaseAdmin
    .from("forum_topics")
    .select("id, title, created_at, author_id")
    .eq("board_id", board.id)
    .order("created_at", { ascending: false })
    .limit(40);

  const topic = matchTopicToFixture((topics ?? []) as Array<{ id: string; title: string; created_at: string; author_id: string }>, fx);
  if (!topic) {
    return { ok: true, fixture: label, topic: null, posted: 0, skipped: ["no match day thread for this fixture yet"] };
  }

  const opponent = opponentOf(fx);
  const hits = pickTeamSheetPosts(await fetchOfficialTimeline(), Date.parse(fx.kickoff_at), opponent);
  if (hits.length === 0) {
    return { ok: true, fixture: label, topic: topic.title, posted: 0, skipped: ["no team sheet posted yet"] };
  }

  const { data: existing } = await supabaseAdmin
    .from("boro_team_sheets")
    .select("tweet_id, image_url")
    .eq("fixture_id", fx.id);
  const seenTweets = new Set((existing ?? []).map((r) => String(r.tweet_id ?? "")));
  const seenImages = new Set((existing ?? []).map((r) => String(r.image_url ?? "")));

  let posted = 0;
  const postedBySide: Record<"boro" | "opponent", number> = { boro: 0, opponent: 0 };
  for (const hit of hits) {
    const imageUrl = hit.images[0]!;
    if (seenTweets.has(hit.tweetId) || seenImages.has(imageUrl)) {
      skipped.push(`already posted ${hit.tweetId}`);
      continue;
    }
    const isUpdate = hit.side === "boro" ? seenTweets.size + postedBySide.boro > 0 : postedBySide.opponent > 0;
    const body = buildTeamSheetBody({
      imageUrl,
      caption: normalizeFancyText(hit.text).replace(/https:\/\/t\.co\/\S+/g, "").replace(/^RT\s+@\w+:\s*/i, "").trim(),
      sourceUrl: hit.url,
      isUpdate,
      teamLabel: hit.side === "opponent" ? opponent : "Boro",
    });
    postedBySide[hit.side] += 1;


    const { data: post, error: postErr } = await supabaseAdmin
      .from("forum_posts")
      .insert({ topic_id: topic.id, author_id: (await getMatchDayAuthorId()) ?? topic.author_id, body })
      .select("id")
      .single();
    if (postErr) {
      skipped.push(`post failed: ${postErr.message}`);
      continue;
    }

    const { error: rowErr } = await supabaseAdmin.from("boro_team_sheets").insert({
      fixture_id: fx.id,
      topic_id: topic.id,
      post_id: post.id,
      tweet_id: hit.tweetId,
      image_url: imageUrl,
      caption: hit.text,
      source_url: hit.url,
      is_update: isUpdate,
      status: "posted",
    });
    if (rowErr) skipped.push(`log failed: ${rowErr.message}`);
    seenTweets.add(hit.tweetId);
    seenImages.add(imageUrl);
    posted += 1;
  }

  // The official graphic is also the fallback source for fantasy automatic
  // substitutions when ESPN has not published its structured line-up yet.
  try {
    const { syncLineupSwaps } = await import("@/lib/fantasy-lineup-swap.server");
    const swaps = await syncLineupSwaps();
    if (swaps.error) skipped.push(`fantasy swaps: ${swaps.error}`);
  } catch (error) {
    skipped.push(`fantasy swaps: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { ok: true, fixture: label, topic: topic.title, posted, skipped };
}

export async function postManualTeamSheet(input: {
  imageUrl: string;
  caption?: string | null;
  sourceUrl?: string | null;
}): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getMatchDayAuthorId } = await import("@/lib/boro-bot-author.server");
  const now = Date.now();

  const { data: fixtures } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id, home_team, away_team, kickoff_at, competition")
    .gte("kickoff_at", new Date(now - 6 * 60 * 60 * 1000).toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(5);
  const fx = ((fixtures ?? []) as FixtureLite[])[0];
  if (!fx) return { ok: false, posted: 0, skipped: [], error: "No upcoming fixture found" };

  const { data: board } = await supabaseAdmin
    .from("forum_boards")
    .select("id")
    .eq("slug", "match-day")
    .maybeSingle();
  if (!board?.id) return { ok: false, posted: 0, skipped: [], error: "Match day board not found" };

  const { data: topics } = await supabaseAdmin
    .from("forum_topics")
    .select("id, title, created_at, author_id")
    .eq("board_id", board.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const topic = matchTopicToFixture((topics ?? []) as Array<{ id: string; title: string; created_at: string; author_id: string }>, fx);
  if (!topic) return { ok: false, posted: 0, skipped: [], error: "No match day thread for this fixture yet" };

  const { count } = await supabaseAdmin
    .from("boro_team_sheets")
    .select("id", { count: "exact", head: true })
    .eq("fixture_id", fx.id);
  const isUpdate = (count ?? 0) > 0;

  const body = buildTeamSheetBody({
    imageUrl: input.imageUrl,
    caption: input.caption ?? null,
    sourceUrl: input.sourceUrl ?? null,
    isUpdate,
  });
  const { data: post, error: postErr } = await supabaseAdmin
    .from("forum_posts")
    .insert({ topic_id: topic.id, author_id: (await getMatchDayAuthorId()) ?? topic.author_id, body })
    .select("id")
    .single();
  if (postErr) return { ok: false, posted: 0, skipped: [], error: postErr.message };

  await supabaseAdmin.from("boro_team_sheets").insert({
    fixture_id: fx.id,
    topic_id: topic.id,
    post_id: post.id,
    image_url: input.imageUrl,
    caption: input.caption ?? null,
    source_url: input.sourceUrl ?? null,
    is_update: isUpdate,
    status: "manual",
  });

  return { ok: true, fixture: `${fx.home_team} v ${fx.away_team}`, topic: topic.title, posted: 1, skipped: [] };
}

export async function removeTeamSheet(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("boro_team_sheets")
    .select("id, post_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Team sheet entry not found" };
  if (row.post_id) await supabaseAdmin.from("forum_posts").delete().eq("id", row.post_id);
  const { error: delErr } = await supabaseAdmin.from("boro_team_sheets").delete().eq("id", id);
  if (delErr) return { ok: false, error: delErr.message };
  return { ok: true };
}

export async function teamSheetStatus() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const { data: fixtures } = await supabaseAdmin
    .from("boro_fixtures")
    .select("id, home_team, away_team, kickoff_at, competition")
    .gte("kickoff_at", new Date(now - 6 * 60 * 60 * 1000).toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(1);
  const fx = ((fixtures ?? []) as FixtureLite[])[0] ?? null;

  let sheets: Array<{
    id: string;
    image_url: string;
    source_url: string | null;
    status: string;
    is_update: boolean;
    posted_at: string;
  }> = [];
  let topicTitle: string | null = null;

  if (fx) {
    const { data } = await supabaseAdmin
      .from("boro_team_sheets")
      .select("id, image_url, source_url, status, is_update, posted_at")
      .eq("fixture_id", fx.id)
      .order("posted_at", { ascending: true });
    sheets = (data ?? []) as typeof sheets;

    const { data: board } = await supabaseAdmin
      .from("forum_boards")
      .select("id")
      .eq("slug", "match-day")
      .maybeSingle();
    if (board?.id) {
      const { data: topics } = await supabaseAdmin
        .from("forum_topics")
        .select("id, title, created_at, author_id")
        .eq("board_id", board.id)
        .order("created_at", { ascending: false })
        .limit(40);
      topicTitle =
        matchTopicToFixture(
          (topics ?? []) as Array<{ id: string; title: string; created_at: string; author_id: string }>,
          fx,
        )?.title ?? null;
    }
  }

  return {
    fixture: fx ? { label: `${fx.home_team} v ${fx.away_team}`, kickoff: fx.kickoff_at, competition: fx.competition } : null,
    topicTitle,
    sheets,
  };
}
