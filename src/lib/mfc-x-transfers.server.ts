/**
 * Transfer feed sourced from Middlesbrough's official X account (@Boro).
 *
 * The club's website squad list lags behind announcements by hours (sometimes
 * days), while the official X account posts every arrival, departure and loan
 * the moment it is confirmed. This reader watches that timeline and applies
 * confirmed movement to the fantasy player pool + club transfer feed straight
 * away. It runs after the website sync on every squad-sync tick, so it always
 * has the last word.
 */
import { fetchOfficialTimeline, normalizeFancyText } from "@/lib/boro-team-sheet.server";

type Admin = { from: (table: string) => any };

const WINDOW_LABEL = "2026/27";
/** Only look at recent posts — older announcements are already reflected. */
const MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

export type XTransferHit = {
  tweetId: string;
  url: string;
  text: string;
  createdAtMs: number;
  direction: "in" | "out";
  kind: "transfer" | "loan";
  otherClub: string | null;
};

const NEGATIVE = [
  /\bunder[\s-]?(?:21|18)s?\b/i,
  /\bu21\b/i,
  /\bu18\b/i,
  /\bwomen'?s\b/i,
  /\brumour\b/i,
  /\bspeculation\b/i,
  /\breportedly\b/i,
  /\blinked with\b/i,
  /\?\s*$/,
];

const IN_PATTERNS = [
  /\bhas signed for\b/i,
  /\bhave signed\b/i,
  /\bwe(?:'ve| have) signed\b/i,
  /\bsigns? for (?:boro|middlesbrough|us)\b/i,
  /\bnew signing\b/i,
  /\bwelcome (?:to (?:boro|the boro|middlesbrough|the club))\b/i,
  /\bjoins? (?:boro|middlesbrough|the club|us)\b/i,
  /\bputs pen to paper\b/i,
  /\bdeal (?:done|complete)\b/i,
  /\bon loan from\b/i,
  /\bloan signing\b/i,
];

const OUT_PATTERNS = [
  /\bjoin(?:s|ed)\b[^.]*\bloan\b/i,
  /\bloan\b[^.]*\bwishes?\b[^.]*\bwell\b/i,
  /\bon loan (?:at|to|with)\b/i,
  /\bloan(?:ed)? (?:out|move|switch|spell)\b/i,
  /\bhas (?:left|departed)\b/i,
  /\bleaves (?:boro|the club|middlesbrough)\b/i,
  /\bdeparts?\b/i,
  /\bhas been released\b/i,
  /\bcompleted (?:a|his) (?:permanent )?(?:move|transfer) to\b/i,
  /\bjoins? [A-Z][\w'&.-]* (?:on a permanent deal|permanently)\b/i,
  /\bfarewell\b/i,
  /\bgood luck\b/i,
];

const LOAN_RE = /\bloan\b/i;

const CLUB_SUFFIX =
  "(?:United|City|Town|Rovers|County|Albion|Athletic|Wanderers|Hotspur|FC|AFC|Forest|Villa|Argyle|Orient|Alexandra|Palace|Rangers|Celtic|Wednesday)";

/** Best-effort pull of the other club from an announcement. */
export function otherClubFromText(text: string): string | null {
  const t = normalizeFancyText(text);
  const re = new RegExp(
    `(?:on loan (?:at|to|with|from)|loan (?:at|to|with|from)|join(?:s|ed)|move to|transfer to|switch to|signed for)\\s+(?:(?:[A-Z][\\w'’\\-]+\\s+)?(?:side|club|outfit|team)\\s+)?((?:[A-Z][\\w'&.\\-]+|${CLUB_SUFFIX})(?:\\s+(?:[A-Z][\\w'&.\\-]+|${CLUB_SUFFIX}|of|de|and))*)`,
  );
  const m = t.match(re);
  const raw = m?.[1]?.trim().replace(/[.,!]+$/, "") ?? null;
  if (!raw) return null;
  if (/^(boro|middlesbrough|the|us|we)\b/i.test(raw)) return null;
  return raw.split(/\s+/).slice(0, 4).join(" ");
}

export function classifyTransferPost(rawText: string): { direction: "in" | "out"; kind: "transfer" | "loan" } | null {
  const text = normalizeFancyText(rawText);
  if (NEGATIVE.some((re) => re.test(text))) return null;
  const isOut = OUT_PATTERNS.some((re) => re.test(text));
  const isIn = IN_PATTERNS.some((re) => re.test(text));
  if (!isIn && !isOut) return null;
  // "joins X on loan" wins over "on loan from" style incoming wording.
  const direction: "in" | "out" = isOut && !/\bon loan from\b/i.test(text) ? "out" : isIn ? "in" : "out";
  return { direction, kind: LOAN_RE.test(text) ? "loan" : "transfer" };
}

/** How many posts the timeline returned on the last read (diagnostics). */
export let lastTimelineSize = 0;

export async function fetchXTransferPosts(): Promise<XTransferHit[]> {
  const timeline = await fetchOfficialTimeline().catch(() => []);
  lastTimelineSize = timeline.length;
  const cutoff = Date.now() - MAX_AGE_MS;
  const out: XTransferHit[] = [];
  for (const post of timeline) {
    if (post.createdAtMs && post.createdAtMs < cutoff) continue;
    const cls = classifyTransferPost(post.text);
    if (!cls) continue;
    out.push({
      tweetId: post.tweetId,
      url: post.url,
      text: normalizeFancyText(post.text),
      createdAtMs: post.createdAtMs,
      direction: cls.direction,
      kind: cls.kind,
      otherClub: otherClubFromText(post.text),
    });
  }
  return out.sort((a, b) => a.createdAtMs - b.createdAtMs);
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A post mentions a player when their full name or surname appears in it. */
function mentionsPlayer(text: string, playerName: string): boolean {
  const t = ` ${normName(text)} `;
  const full = normName(playerName);
  if (full && t.includes(` ${full} `)) return true;
  const bits = full.split(" ").filter(Boolean);
  const last = bits.length > 1 ? bits[bits.length - 1]! : bits[0] ?? "";
  if (last.length < 4) return false;
  return t.includes(` ${last} `);
}

export type XTransferSyncResult = {
  ok: boolean;
  posts?: number;
  timeline?: number;
  applied?: string[];
  logged?: string[];
  error?: string;
};

export async function syncFantasyTransfersFromX(admin: Admin): Promise<XTransferSyncResult> {
  let posts: XTransferHit[];
  try {
    posts = await fetchXTransferPosts();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (posts.length === 0) {
    return { ok: true, posts: 0, timeline: lastTimelineSize, applied: [], logged: [] };
  }

  const { data: rows, error } = await admin
    .from("fantasy_players")
    .select("id, name, status, status_locked, loan_club, squad_level");
  if (error) return { ok: false, error: error.message };
  const players = (rows ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    status_locked?: boolean | null;
    loan_club?: string | null;
    squad_level?: string | null;
  }>;

  const applied: string[] = [];
  const logged: string[] = [];

  for (const post of posts) {
    const matches = players.filter((p) => mentionsPlayer(post.text, p.name));
    // A post naming half the squad is a round-up, not a transfer announcement.
    if (matches.length === 0 || matches.length > 2) continue;
    const date = post.createdAtMs ? new Date(post.createdAtMs).toISOString().slice(0, 10) : null;

    for (const player of matches) {
      const club = post.otherClub;
      const note =
        post.direction === "out"
          ? post.kind === "loan"
            ? club
              ? `Out on loan at ${club} (announced by the club on X)`
              : "Out on loan (announced by the club on X)"
            : club
              ? `Left the club for ${club} (announced by the club on X)`
              : "Left the club (announced by the club on X)"
          : post.kind === "loan"
            ? club
              ? `Loan signing from ${club} (announced by the club on X)`
              : "Loan signing (announced by the club on X)"
            : "Signed for Boro (announced by the club on X)";

      if (!player.status_locked) {
        const next =
          post.direction === "out" ? (post.kind === "loan" ? "loaned_out" : "departed") : "active";
        const changes: Record<string, unknown> =
          next === "loaned_out"
            ? { status: "loaned_out", loan_club: club ?? player.loan_club ?? null, departed_at: null }
            : next === "departed"
              ? { status: "departed", departed_at: new Date().toISOString() }
              : { status: "active", loan_club: null, departed_at: null };
        const same =
          player.status === next &&
          (next !== "loaned_out" || (player.loan_club ?? null) === (club ?? player.loan_club ?? null));
        if (!same) {
          const { error: upErr } = await admin.from("fantasy_players").update(changes).eq("id", player.id);
          if (!upErr) applied.push(`${player.name}: ${next}`);
        }
      }

      // One feed entry per player + direction, same rule as the website sync.
      const { data: seen } = await admin
        .from("fantasy_club_transfers")
        .select("id")
        .eq("player_name", player.name)
        .eq("direction", post.direction)
        .maybeSingle();
      if (seen) continue;
      const { error: insErr } = await admin.from("fantasy_club_transfers").insert({
        player_name: player.name,
        direction: post.direction,
        player_id: player.id,
        transfer_date: date ?? new Date().toISOString().slice(0, 10),
        window_label: WINDOW_LABEL,
        note,
        other_club: club,
      });
      if (!insErr) logged.push(`${player.name} ${post.direction}`);
    }
  }

  return { ok: true, posts: posts.length, timeline: lastTimelineSize, applied, logged };
}
