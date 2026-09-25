import type { TimeZoneChoice } from "./import-time";
import { ukListingInstant } from "./import-time";
import {
  formatSportsListingBlock,
  isLikelyChannelLabel,
  parseSportsListingBlock,
  type SportsListingEvent,
} from "./sports-listing-format";

export type ImportCheckIssue = {
  level: "error" | "warning";
  message: string;
  events?: number[]; // 1-based card numbers
};

export type ImportCheckResult = {
  events: SportsListingEvent[];
  formatted: string | null;
  issues: ImportCheckIssue[];
  errors: number;
  warnings: number;
};

// Clock-looking token (12:30, 7.45pm, 9pm) — used to count post rows that carry a time.
const CLOCK_RE = /\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b/i;
const SLOT_JUNK_RE = /\buntil\b|\bstart:|\bstop:|\d{2}-\d{2}-\d{4}/i;
const HEADING_JUNK_RE = /^[#*_>\s]|^(vip|us|uk)\s*\|/i;

/**
 * Double-checks an import before it is saved: runs the exact save formatter,
 * re-reads its output, and flags anything that looks mis-paired, missing,
 * duplicated, stale, or unstable on round trip.
 */
export function checkSportsImport(
  raw: string,
  sourceZone: TimeZoneChoice | null,
  nowMs: number = Date.now(),
): ImportCheckResult {
  const issues: ImportCheckIssue[] = [];
  const formatted = formatSportsListingBlock({ raw, sourceZone });
  const events = formatted ? parseSportsListingBlock(formatted) : [];

  if (!formatted || events.length === 0) {
    issues.push({ level: "error", message: "No events were recognised in this post." });
    return finish(events, formatted, issues);
  }

  // 1. Round trip: the saved body must read back identically, otherwise the
  //    guide changes the next time it is opened, merged or auto-cleared.
  const again = formatSportsListingBlock({ raw: formatted, sourceZone: "gmt" });
  if (again !== null && again.trim() !== formatted.trim()) {
    issues.push({ level: "error", message: "The saved guide wouldn't read back the same way — times or channels could shift after posting." });
  }

  const add = (level: ImportCheckIssue["level"], message: string, list: number[]) => {
    if (list.length) issues.push({ level, message, events: list });
  };

  const noTime: number[] = [];
  const noChannel: number[] = [];
  const channelAsTitle: number[] = [];
  const junkTitle: number[] = [];
  const stale: number[] = [];
  const seen = new Map<string, number>();
  const dupes: number[] = [];

  events.forEach((e, i) => {
    const n = i + 1;
    const title = (e.title ?? "").trim();
    if (!e.time?.trim()) noTime.push(n);
    if (!e.channels?.length) noChannel.push(n);
    if (title && isLikelyChannelLabel(title)) channelAsTitle.push(n);
    if (
      title.replace(/[^A-Za-z0-9]/g, "").length < 3 ||
      SLOT_JUNK_RE.test(title) ||
      HEADING_JUNK_RE.test(title) ||
      /^[\d\s.:\-–—/]+$/.test(title)
    ) junkTitle.push(n);
    for (const ch of e.channels ?? []) {
      if (SLOT_JUNK_RE.test(ch) || ch.length > 40) { junkTitle.push(n); break; }
    }
    const key = `${e.date}|${e.time}|${title.toLowerCase()}|${(e.channels ?? []).join(",").toLowerCase()}`;
    if (seen.has(key)) dupes.push(n); else seen.set(key, n);
    const at = ukListingInstant(e.date, e.time);
    if (at !== null && nowMs >= at + 10 * 60 * 60 * 1000) stale.push(n);
  });

  add("error", "Missing a start time", noTime);
  add("error", "Event name looks like a channel (title and channel may be swapped)", channelAsTitle);
  add("error", "Event name or channel looks like leftover post text", [...new Set(junkTitle)]);
  add("warning", "No channel listed", noChannel);
  add("warning", "Listed twice", dupes);
  add("warning", "Started more than 10 hours ago — will be cleared automatically", stale);

  // 2. Nothing dropped: every row in the post that carries a clock time should
  //    have become an event. Fewer events than timed rows means lost listings.
  const timedRows = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && CLOCK_RE.test(l) && !/^(all\s+times|times\s+(are|in))/i.test(l)).length;
  if (timedRows > events.length) {
    issues.push({
      level: "warning",
      message: `The post has ${timedRows} rows with a time but only ${events.length} events were made — ${timedRows - events.length} may have been missed.`,
    });
  }

  return finish(events, formatted, issues);
}

function finish(events: SportsListingEvent[], formatted: string | null, issues: ImportCheckIssue[]): ImportCheckResult {
  return {
    events,
    formatted,
    issues,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
  };
}
