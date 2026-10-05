import { zonedWallTimeToUtcMs, dateInTimeZone } from "@/hooks/use-timezone";
import { isLikelyChannelLabel, normalizeSportsEventTitle } from "@/lib/sports-listing-format";

// Abbreviation -> IANA zone. IANA zones already handle DST correctly.
const ZONE_MAP: Record<string, string> = {
  // Sports guide editors use GMT to mean UK clock time, so it must follow
  // Europe/London and automatically switch between GMT and BST.
  GMT: "Europe/London",
  UTC: "Etc/UTC",
  UK: "Europe/London",
  BST: "Europe/London",
  ET: "America/New_York",
  EST: "America/New_York",
  EDT: "America/New_York",
  CT: "America/Chicago",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MT: "America/Denver",
  MST: "America/Denver",
  MDT: "America/Denver",
  PT: "America/Los_Angeles",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  CET: "Europe/Paris",
  CEST: "Europe/Paris",
  AEST: "Australia/Sydney",
  AEDT: "Australia/Sydney",
  JST: "Asia/Tokyo",
  IST: "Asia/Kolkata",
};

const ZONE_TOKENS = Object.keys(ZONE_MAP)
  .sort((a, b) => b.length - a.length)
  .join("|");
// Some sources (e.g. US schedules) write the zone BEFORE the time:
//   "ET 7:00 PM", "ET 19:45", "PT 8 pm"
// Rewrite those to the canonical "<time> <zone>" form before the main
// regex pass so a single ET-only event doesn't break the card.
// Require an actual time shape (HH:MM / HH.MM or am/pm suffix) so bare
// day numbers in a date heading like "ET 25 May 2026" are NOT rewritten.
const LEADING_ZONE_TIME_RE = new RegExp(
  `\\b(${Object.keys(ZONE_MAP).sort((a, b) => b.length - a.length).join("|")})\\s+(\\d{1,2}(?:[:.]\\d{2}\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?|\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)))\\b`,
  "gi",
);
function normalizeLeadingZoneTimes(text: string): string {
  return text.replace(LEADING_ZONE_TIME_RE, (_, zone: string, time: string) => `${time} ${zone}`);
}
// Matches: "19:45 GMT", "10.30 GMT", "7:30pm ET", "8 pm CET", "20:00 UTC+1", "9am GMT-05:30"
const TIME_RE = new RegExp(
  `\\b(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\s*(?:(${ZONE_TOKENS})|(?:(UTC|GMT)\\s*([+-])\\s*(\\d{1,2})(?::?(\\d{2}))?))\\b`,
  "gi",
);
// Bare time without an explicit zone (e.g. "19:45", "7:30pm", "8 pm").
// Used when caller specifies a defaultZone (e.g. sports guide is always GMT).
const BARE_TIME_RE = new RegExp(
  `\\b(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\b`,
  "gi",
);

const UK_GUIDE_ZONE_TOKENS = new Set(["GMT", "UTC", "UK", "BST"]);

function resolveSourceTz(abbrev: string, defaultZone?: string): string | null {
  const source = abbrev.toUpperCase();
  const defaultSource = defaultZone?.toUpperCase();
  const defaultTz = defaultSource ? ZONE_MAP[defaultSource] : undefined;
  if (defaultTz && defaultSource && UK_GUIDE_ZONE_TOKENS.has(defaultSource) && UK_GUIDE_ZONE_TOKENS.has(source)) return defaultTz;
  return ZONE_MAP[source] ?? null;
}

function tzOffsetMinutes(instantMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return (asUtc - instantMs) / 60000;
}

function tzAbbrev(instantMs: number, tz: string): string {
  // Prefer a named abbreviation (e.g. "EDT", "CET", "AEST") over the
  // offset-style "GMT-4" / "GMT+1" that Intl returns for many zones.
  const tryFormat = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts })
      .formatToParts(new Date(instantMs))
      .find((p) => p.type === "timeZoneName")?.value ?? "";

  const isOffset = (s: string) => /^(GMT|UTC)([+-]|$)/i.test(s.trim());

  const short = tryFormat({ timeZoneName: "short" });
  if (short && !isOffset(short)) return short;

  const shortGeneric = tryFormat({ timeZoneName: "shortGeneric" });
  if (shortGeneric && !isOffset(shortGeneric)) return shortGeneric;

  const longGeneric = tryFormat({ timeZoneName: "longGeneric" });
  if (longGeneric && !isOffset(longGeneric)) {
    // Abbreviate "Eastern Time" → "ET", "Central European Time" → "CET".
    const abbr = longGeneric
      .split(/\s+/)
      .filter((w) => /^[A-Z]/.test(w))
      .map((w) => w[0])
      .join("");
    if (abbr.length >= 2) return abbr;
  }

  return short;
}

function sourceDateLabelFromHeading(text: string, dateStr: string): string {
  const weekday = text.trim().match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*/i)?.[0];
  const weekdayName = weekday
    ? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1).toLowerCase()}`
    : null;
  const [, month, day] = dateStr.split("-").map((part) => parseInt(part, 10));
  const monthYear = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateStr}T00:00:00Z`));
  if (weekdayName) return `${weekdayName} ${day} ${monthYear}`;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

function hasSecondsSuffix(text: string, end: number): boolean {
  return text[end] === ":" && /^\d{2}\b/.test(text.slice(end + 1));
}

function shouldIgnoreBareSecondsMatch(text: string, start: number, end: number): boolean {
  if (!hasSecondsSuffix(text, end)) return false;
  if (parseLeadingGuideDate(text)) return false;
  const trimmed = text.trim();
  const matchedWithSeconds = text.slice(start, end + 3).trim();
  return trimmed !== matchedWithSeconds;
}

function cleanEventTitleText(value: string): string {
  return normalizeSportsEventTitle(value
    .replace(/\b\d{1,2}:\d{2}:\d{2}\b\s*$/g, " ")
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/(^|\s):\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:·•|]+|[\s\-–—:·•|]+$/g, "")
    .trim());
}

function isDateOnlyText(value: string): boolean {
  return Boolean(parseGuideDate(value.trim()));
}

function hasMeaningfulTextOutsideMatches(text: string, matches: ParsedMatch[]): boolean {
  let remaining = text;
  for (const match of [...matches].sort((a, b) => b.start - a.start)) {
    remaining = `${remaining.slice(0, match.start)} ${remaining.slice(match.end)}`;
  }
  const cleaned = cleanEventTitleText(remaining);
  return Boolean(cleaned && !isWeekdayOnly(cleaned) && !isDateOnlyText(cleaned));
}

function normalizedMatchedTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

interface ParsedMatch {
  start: number;
  end: number;
  converted: string;
  sourcePrefix?: string;
  sourceTime: string;
  sourceZone: string;
  sourceIanaZone: string;
  localTime: string;
  localZone: string;
  sourceDate: string;
  localDate: string;
  raw: string;
  utcMs: number;
}

export interface EventTime {
  source: string;
  converted: string;
}

function parseMatches(
  text: string,
  viewerTz: string,
  defaultZone?: string,
  sourceDateStr?: string,
  sourceDateLabel?: string,
): ParsedMatch[] {
  const results: ParsedMatch[] = [];
  // Normalize "ET 7:00 PM" -> "7:00 PM ET" so a leading-zone time still
  // matches TIME_RE and BARE_TIME_RE below. Length-preserving as long as
  // the swap keeps the same characters separated by a single space (it
  // does for the cases we care about), so match indices remain valid for
  // the purpose of locating the time within the line.
  text = normalizeLeadingZoneTimes(text);
  const inlineDate = parseLeadingGuideDate(text);
  const effectiveSourceDateStr = inlineDate?.dateStr ?? sourceDateStr;
  const effectiveSourceDateLabel = inlineDate?.sourceDateLabel ?? sourceDateLabel;
  const effectiveDefaultZone = inlineDate?.sourceZone ?? defaultZone;
  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(text)) !== null) {
    const [, hStr, mStr, ampmRaw, abbrev, offsetBase, sign, offHStr, offMStr] = m;
    let hour = parseInt(hStr, 10);
    const minute = mStr ? parseInt(mStr, 10) : 0;
    if (hour > 23 || minute > 59) continue;
    const ampm = ampmRaw?.toLowerCase().replace(/\./g, "");
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    if (!ampm && hour > 23) continue;
    // Need either ampm or HH:MM form to count as a real time
    if (!ampm && !mStr) continue;

    const todayUtc = new Date();
    const matchedSourceTime = normalizedMatchedTime(hour, minute);
    let utcMs: number;
    let sourceLabel: string;

    if (abbrev) {
      const tz = resolveSourceTz(abbrev, defaultZone);
      if (!tz) continue;
      const dateStr = effectiveSourceDateStr ?? dateInTimeZone(todayUtc, tz);
      const timeStr = `${matchedSourceTime}:00`;
      utcMs = zonedWallTimeToUtcMs(dateStr, timeStr, tz);
      sourceLabel = tz;
    } else if (offsetBase && sign && offHStr) {
      const offH = parseInt(offHStr, 10);
      const offM = offMStr ? parseInt(offMStr, 10) : 0;
      const offsetMin = (offH * 60 + offM) * (sign === "-" ? -1 : 1);
      // Source wall time interpreted at this offset:
      const todayStr = effectiveSourceDateStr ?? new Date().toISOString().slice(0, 10);
      const naiveUtc = Date.parse(
        `${todayStr}T${matchedSourceTime}:00Z`,
      );
      utcMs = naiveUtc - offsetMin * 60000;
      sourceLabel = "offset";
    } else {
      continue;
    }

    if (!Number.isFinite(utcMs)) continue;

    const hh = new Intl.DateTimeFormat("en-GB", {
      timeZone: viewerTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(utcMs));
    const abbr = tzAbbrev(utcMs, viewerTz) || viewerTz;
    const dayDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: viewerTz,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(utcMs));
    const sourceTz = sourceLabel !== "offset" ? sourceLabel : viewerTz;
    const sourceDayDate =
      effectiveSourceDateLabel ??
      new Intl.DateTimeFormat("en-GB", {
        timeZone: sourceTz,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(utcMs));
    const sourceAbbr =
      sourceLabel !== "offset"
        ? tzAbbrev(utcMs, sourceTz) || "GMT"
        : tzAbbrev(utcMs, viewerTz) || "";
    results.push({
      start: m.index,
      end: m.index + m[0].length,
      converted: `${dayDate} ${hh}${abbr ? ` ${abbr}` : ""}`,
      sourcePrefix: `${sourceDayDate} `,
      sourceTime: matchedSourceTime,
      sourceZone: sourceAbbr,
      sourceIanaZone: sourceTz,
      localTime: hh,
      localZone: abbr,
      sourceDate: sourceDayDate,
      localDate: dayDate,
      raw: m[0],
      utcMs,
    });
  }
  if (effectiveDefaultZone) {
    const tz = ZONE_MAP[effectiveDefaultZone.toUpperCase()];
    if (tz) {
      BARE_TIME_RE.lastIndex = 0;
      let bm: RegExpExecArray | null;
      while ((bm = BARE_TIME_RE.exec(text)) !== null) {
        // Skip if this span overlaps a zone-tagged match already captured
        if (results.some((r) => bm!.index < r.end && bm!.index + bm![0].length > r.start)) continue;
        if (shouldIgnoreBareSecondsMatch(text, bm.index, bm.index + bm[0].length)) continue;
        const [, hStr, mStr, ampmRaw] = bm;
        let hour = parseInt(hStr, 10);
        const minute = mStr ? parseInt(mStr, 10) : 0;
        if (hour > 23 || minute > 59) continue;
        const ampm = ampmRaw?.toLowerCase().replace(/\./g, "");
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        if (!ampm && hour > 23) continue;
        if (!ampm && !mStr) continue;
        const todayUtc = new Date();
        const matchedSourceTime = normalizedMatchedTime(hour, minute);
        const dateStr = effectiveSourceDateStr ?? dateInTimeZone(todayUtc, tz);
        const timeStr = `${matchedSourceTime}:00`;
        const utcMs = zonedWallTimeToUtcMs(dateStr, timeStr, tz);
        if (!Number.isFinite(utcMs)) continue;
        const hh = new Intl.DateTimeFormat("en-GB", {
          timeZone: viewerTz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(utcMs));
        const abbr = tzAbbrev(utcMs, viewerTz) || viewerTz;
        const dayDate = new Intl.DateTimeFormat("en-GB", {
          timeZone: viewerTz,
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(utcMs));
        const sourceDayDate =
          effectiveSourceDateLabel ??
          new Intl.DateTimeFormat("en-GB", {
            timeZone: tz,
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(new Date(utcMs));
        const sourceAbbr = tzAbbrev(utcMs, tz) || effectiveDefaultZone.toUpperCase();
        results.push({
          start: bm.index,
          end: bm.index + bm[0].length,
          converted: `${dayDate} ${hh}${abbr ? ` ${abbr}` : ""}`,
          sourcePrefix: `${sourceDayDate} `,
          sourceTime: matchedSourceTime,
          sourceZone: sourceAbbr,
          sourceIanaZone: tz,
          localTime: hh,
          localZone: abbr,
          sourceDate: sourceDayDate,
          localDate: dayDate,
          raw: bm[0],
          utcMs,
        });
      }
      results.sort((a, b) => a.start - b.start);
    }
  }
  return results;
}

/**
 * Strip HTML and return matched event times (source text + viewer-tz time).
 * Useful for showing a summary pill on list/card views.
 */
export function findEventTimes(html: string, viewerTz: string): EventTime[] {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = parseMatches(text, viewerTz);
  return matches.map((m) => ({
    source: text.slice(m.start, m.end),
    converted: m.converted,
  }));
}

/**
 * Walk the (HTML) body of a sports guide and return either the earliest
 * or latest event instant (UTC ms) it can parse, or null if no recognisable
 * event time is found. Used to schedule auto-clear relative to a listed
 * event rather than the edit time.
 */
function findEventUtcMs(html: string, mode: "earliest" | "latest", defaultZone = "GMT"): number | null {
  const normalized = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = normalized
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  const lines = decoded
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const viewerTz = "Etc/UTC";
  let best: number | null = null;
  let currentDate: string | null = null;
  let currentDateLabel: string | null = null;
  for (const line of lines) {
    const parsedDate = parseGuideDate(line);
    if (parsedDate) {
      currentDate = parsedDate;
      currentDateLabel = sourceDateLabelFromHeading(line, parsedDate);
      continue;
    }
    const matches = parseMatches(
      line,
      viewerTz,
      defaultZone,
      currentDate ?? undefined,
      currentDateLabel ?? undefined,
    );
    for (const m of matches) {
      if (!Number.isFinite(m.utcMs)) continue;
      if (best === null) best = m.utcMs;
      else if (mode === "earliest" ? m.utcMs < best : m.utcMs > best) best = m.utcMs;
    }
  }
  return best;
}

export function findEarliestEventUtcMs(html: string, defaultZone = "GMT"): number | null {
  return findEventUtcMs(html, "earliest", defaultZone);
}

export function findLatestEventUtcMs(html: string, defaultZone = "GMT"): number | null {
  return findEventUtcMs(html, "latest", defaultZone);
}

/** True when a line is only a date heading (e.g. "Saturday 1 January 2026"). */
export function isGuideDateHeading(text: string): boolean {
  return parseGuideDate(text.trim()) !== null;
}

function parseGuideDate(text: string): string | null {
  // Strip leading/trailing timezone abbreviations (e.g. "ET 25 May 2026",
  // "25 May 2026 ET") so the date itself can still be parsed when guides
  // label their headings with a zone instead of (or in addition to) GMT.
  const trimmed = text
    .replace(
      /(^|\s)(?:GMT|UTC|UK|BST|CET|CEST|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|AEST|AEDT|JST|IST)(?=\s|$)/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const weekdayPrefix = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[\s,]*/i;
  if (!/\d/.test(trimmed) || trimmed.length >= 80) return null;
  const withoutWeekday = trimmed.replace(weekdayPrefix, "").trim();
  const numeric = withoutWeekday.match(
    /^(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4}))$/,
  );
  if (numeric) {
    const [, isoY, isoM, isoD, d, m, y] = numeric;
    if (isoY && isoM && isoD) {
      return `${isoY}-${isoM.padStart(2, "0")}-${isoD.padStart(2, "0")}`;
    }
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Year is optional — bare "25 May" defaults to the current year so guides
  // that omit it still produce a proper date heading instead of leaking into
  // the next event's title.
  const named = withoutWeekday.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{2}|\d{4}))?$/i,
  );
  if (named) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const [, d, mon, y] = named;
    const month = months.findIndex((m) => mon.toLowerCase().startsWith(m)) + 1;
    if (!month) return null;
    const year = !y
      ? new Date().getUTCFullYear()
      : y.length === 2
        ? 2000 + parseInt(y, 10)
        : parseInt(y, 10);
    return `${year}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const monthFirst = withoutWeekday.match(
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2}|\d{4}))?$/i,
  );
  if (monthFirst) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const [, mon, d, y] = monthFirst;
    const month = months.findIndex((m) => mon.toLowerCase().startsWith(m)) + 1;
    if (!month) return null;
    const year = !y
      ? new Date().getUTCFullYear()
      : y.length === 2
        ? 2000 + parseInt(y, 10)
        : parseInt(y, 10);
    return `${year}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseLeadingGuideDate(text: string): { dateStr: string; sourceDateLabel: string; sourceZone?: string } | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const leading = trimmed.match(
    /^((?:(?:GMT|UTC|UK|BST|CET|CEST|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|AEST|AEDT|JST|IST)\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[\s,]+)?(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:\d{2}|\d{4})|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+(?:\s+(?:\d{2}|\d{4}))?|[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+(?:\d{2}|\d{4}))?))(?=\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b)/i,
  )?.[1];
  if (!leading) return null;
  const sourceZone = leading.match(/^(GMT|UTC|UK|BST|CET|CEST|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|AEST|AEDT|JST|IST)\b/i)?.[1]?.toUpperCase();
  const hasWeekday = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.test(leading);
  const dateStr = parseGuideDate(hasWeekday ? leading : `Monday ${leading}`);
  if (!dateStr) return null;
  return {
    dateStr,
    sourceDateLabel: sourceDateLabelFromHeading(hasWeekday ? leading : "", dateStr),
    sourceZone,
  };
}

function startsWithScheduleTime(
  text: string,
  viewerTz: string,
  defaultZone?: string,
  sourceDateStr?: string,
  sourceDateLabel?: string,
): boolean {
  const matches = parseMatches(text, viewerTz, defaultZone, sourceDateStr, sourceDateLabel);
  if (!matches.length) return false;
  if (parseLeadingGuideDate(text)) return true;
  const first = matches[0];
  const prefix = cleanEventTitleText(text.slice(0, first.start));
  return !prefix || isWeekdayOnly(prefix) || isDateOnlyText(prefix) || isLikelyChannelLabel(prefix) || !hasMeaningfulTextOutsideMatches(text, [first]);
}

function isWeekdayOnly(text: string): boolean {
  return /^(mon|tue|wed|thu|fri|sat|sun)(day)?$/i.test(text.trim());
}

export function annotateTimesInEl(root: HTMLElement, viewerTz: string, defaultZone?: string): void {
  const BLOCK_SELECTOR = "li, p, tr, div, h1, h2, h3, h4, h5, h6";
  const INLINE_LINE_SELECTOR = "b, strong";

  // If a guide is published in US Eastern time (a zone token appears anywhere
  // in the content), bare times without a zone must be read as ET so the
  // reader can put UK time first. Explicit per-line zones still win.
  const rootText = root.textContent ?? "";
  if (
    (!defaultZone || UK_GUIDE_ZONE_TOKENS.has(defaultZone.toUpperCase())) &&
    /\b(ET|EST|EDT)\b/.test(rootText) &&
    !/\b(GMT|BST|UK|UTC)\b/i.test(rootText)
  ) {
    defaultZone = "ET";
  }


  // Restore any previously transformed rows back to their original markup so
  // re-runs (e.g. body content changed) stay idempotent.
  root.querySelectorAll("[data-tz-row]").forEach((row) => {
    const original = (row as HTMLElement).dataset.tzOriginal;
    if (original != null) {
      row.innerHTML = original;
      (row as HTMLElement).className = (row as HTMLElement).dataset.tzPrevClass ?? "";
      row.removeAttribute("data-tz-row");
      delete (row as HTMLElement).dataset.tzOriginal;
      delete (row as HTMLElement).dataset.tzPrevClass;
    }
  });

  // Rich-text saves can leave the guide date as a loose root text node
  // before the first <div>. Wrap that text so the date context is not lost
  // when event rows are parsed and converted.
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (!parseGuideDate(text) && !parseMatches(text, viewerTz, defaultZone).length) return;
    const line = document.createElement("div");
    line.textContent = text;
    root.replaceChild(line, node);
  });

  // Some editors paste one event as a nested wrapper:
  //   <div><div>May 26 7:00 PM ET</div><div>Team A vs Team B</div></div><div>Channel</div>
  // The card parser expects those as sibling lines. Flatten only obvious
  // top-level wrappers whose first child is a time and second child is a title.
  Array.from(root.children).forEach((child) => {
    const wrapper = child as HTMLElement;
    if (!wrapper.matches("div, li, p")) return;
    const childLines = Array.from(wrapper.children).filter((el) =>
      (el as HTMLElement).matches(BLOCK_SELECTOR),
    ) as HTMLElement[];
    if (childLines.length < 2) return;
    const firstText = (childLines[0].textContent ?? "").trim();
    const secondText = (childLines[1].textContent ?? "").trim();
    if (!firstText || !secondText) return;
    if (!parseMatches(firstText, viewerTz, defaultZone).length) return;
    if (parseMatches(secondText, viewerTz, defaultZone).length || parseGuideDate(secondText)) return;
    for (const node of Array.from(wrapper.childNodes)) root.insertBefore(node, wrapper);
    wrapper.remove();
  });

  // Hide any element whose entire visible text is just a date heading
  // like "Saturday 23-05-26" or "Saturday, 23 May 2026". Runs across ALL
  // tags (h1-h6, strong, span, div, p, li...) so editor formatting can't
  // hide them from the row-block pass.
  const isDateOnly = (s: string) => Boolean(parseGuideDate(s));
  Array.from(root.querySelectorAll<HTMLElement>("*")).forEach((el) => {
    if (el.closest("[data-tz-row]")) return;
    const t = (el.textContent ?? "").trim();
    if (!t || !isDateOnly(t)) return;
    // Only hide a leaf-ish node — skip if a child element also matches
    // (we'll get to the child on its own iteration and hiding the parent
    // would over-hide).
    const childMatch = Array.from(el.children).some((c) =>
      isDateOnly((c.textContent ?? "").trim()),
    );
    if (childMatch) return;
    if (el.dataset.tzOriginal == null) {
      el.dataset.tzOriginal = el.innerHTML;
      el.dataset.tzPrevClass = el.className;
    }
    el.setAttribute("data-tz-row", "1");
    el.className = "hidden";
  });

  // Some pasted editor content stores the first event time as direct text in a
  // wrapper div before nested event-name/source divs. Move that loose leading
  // text into its own line so it can be numbered like the later events.
  Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).forEach((el) => {
    if (el.closest("[data-tz-row]")) return;
    const firstBlockChild = Array.from(el.children).find((child) =>
      (child as HTMLElement).matches(BLOCK_SELECTOR),
    );
    if (!firstBlockChild) return;
    const leadingNodes: ChildNode[] = [];
    for (const node of Array.from(el.childNodes)) {
      if (node === firstBlockChild) break;
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).matches(BLOCK_SELECTOR)) break;
      leadingNodes.push(node);
    }
    const leadingText = leadingNodes.map((node) => node.textContent ?? " ").join(" ").trim();
    if (!leadingText || !parseMatches(leadingText, viewerTz, defaultZone).length) return;
    const line = document.createElement("div");
    for (const node of leadingNodes) line.appendChild(node);
    el.insertBefore(line, firstBlockChild);
  });

  // Pick blocks that look like a single schedule entry. The rich-text editor
  // wraps lines in <div>, so include that — but only leaf-level blocks
  // (no nested block children) so we don't wipe a wrapping <div> that
  // contains multiple lines.
  const hasBlockAncestor = (el: HTMLElement) => {
    let parent = el.parentElement;
    while (parent && parent !== root) {
      if (parent.matches(BLOCK_SELECTOR)) return true;
      parent = parent.parentElement;
    }
    return false;
  };
  const isLineElement = (el: HTMLElement) =>
    (el.matches(BLOCK_SELECTOR) && !el.querySelector(BLOCK_SELECTOR)) ||
    (el.matches(INLINE_LINE_SELECTOR) && !hasBlockAncestor(el));
  const all = Array.from(
    root.querySelectorAll<HTMLElement>(`${BLOCK_SELECTOR}, ${INLINE_LINE_SELECTOR}`),
  );
  const blocks = all.filter(isLineElement).sort((a, b) => {
    const position = a.compareDocumentPosition(b);
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  let currentSourceDate: string | null = null;
  let currentSourceDateLabel: string | null = null;
  for (const [blockIndex, block] of blocks.entries()) {
    // Skip nested blocks (e.g. <p> inside <li>) — outer wins, but we mark
    // already-transformed rows so descendants don't double-process.
    if (block.closest("[data-tz-row]")) {
      const skippedDate = parseGuideDate(block.textContent ?? "");
      if (skippedDate) {
        currentSourceDate = skippedDate;
        currentSourceDateLabel = sourceDateLabelFromHeading(block.textContent ?? "", skippedDate);
      }
      continue;
    }

    const text = block.textContent ?? "";
    if (!text.trim()) continue;
    const parsedBlockDate = parseGuideDate(text);
    if (parsedBlockDate) {
      currentSourceDate = parsedBlockDate;
      currentSourceDateLabel = sourceDateLabelFromHeading(text, parsedBlockDate);
    }
    const rowSourceDate = currentSourceDate;
    const rowSourceDateLabel = currentSourceDateLabel;
    const matches = parseMatches(
      text,
      viewerTz,
      defaultZone,
      rowSourceDate ?? undefined,
      rowSourceDateLabel ?? undefined,
    );
    if (!matches.length) {
      // Hide standalone date headings like "Saturday 23-05-26" or
      // "Saturday, 23 May 2026" — the per-row pills already show the date.
      const trimmed = text.trim();
      const dateOnly = Boolean(parseGuideDate(trimmed));
      if (dateOnly) {
        if (block.dataset.tzOriginal == null) {
          block.dataset.tzOriginal = block.innerHTML;
          block.dataset.tzPrevClass = block.className;
        }
        block.setAttribute("data-tz-row", "1");
        block.className = "hidden";
      }
      continue;
    }

    const m = matches[0];
    // Derive event name = text with the matched time substring removed. Some
    // feeds put the channel before the time ("EFL 01 | 19:00 Fixture"). Keep
    // that prefix as this event's channel instead of folding it into the title.
    const leadingText = cleanEventTitleText(text.slice(0, m.start));
    const trailingText = cleanEventTitleText(text.slice(m.end));
    const leadingChannel = isLikelyChannelLabel(leadingText) ? leadingText : "";
    let eventName = leadingChannel
      ? trailingText
      : cleanEventTitleText(text.slice(0, m.start) + " " + text.slice(m.end));
    if (isWeekdayOnly(eventName)) eventName = "";
    let previousTitleBlock: HTMLElement | null = null;
    if (!eventName) {
      for (let i = blockIndex - 1; i >= 0; i -= 1) {
        const candidate = blocks[i];
        const sText = (candidate.textContent ?? "").trim();
        if (!sText) continue;
        if (candidate.closest("[data-tz-row]")) {
          if (candidate.dataset.tzUtc) break;
          continue;
        }
        if (parseGuideDate(sText)) break;
        if (
          startsWithScheduleTime(
            sText,
            viewerTz,
            defaultZone,
            currentSourceDate ?? undefined,
            currentSourceDateLabel ?? undefined,
          )
        )
          break;
        previousTitleBlock = candidate;
        eventName = cleanEventTitleText(sText);
        break;
      }
    }
    // A second matched clock is an alternate-zone copy of the same start
    // time, not card content. Never print it beneath the channel chips.
    let caption = "";

    // Absorb following leaf lines as name/caption even when the editor wrapped
    // them in extra containers. Stop cleanly at the next time or date heading.
    const absorbed: HTMLElement[] = [];
    for (const candidate of blocks.slice(blockIndex + 1)) {
      const sText = (candidate.textContent ?? "").trim();
      if (!sText) continue;
      const parsedSiblingDate = parseGuideDate(sText);
      if (parsedSiblingDate) {
        currentSourceDate = parsedSiblingDate;
        currentSourceDateLabel = sourceDateLabelFromHeading(sText, parsedSiblingDate);
        if (candidate.dataset.tzOriginal == null) {
          candidate.dataset.tzOriginal = candidate.innerHTML;
          candidate.dataset.tzPrevClass = candidate.className;
        }
        candidate.setAttribute("data-tz-row", "1");
        candidate.className = "hidden";
        break;
      }
      if (candidate.closest("[data-tz-row]")) continue;
      if (
        startsWithScheduleTime(
          sText,
          viewerTz,
          defaultZone,
          currentSourceDate ?? undefined,
          currentSourceDateLabel ?? undefined,
        )
      )
        break;
      absorbed.push(candidate);
      if (absorbed.length >= 40) break;
    }
    if (absorbed[0] && !previousTitleBlock) {
      eventName = cleanEventTitleText(absorbed[0].textContent ?? "") || eventName;
    }
    // Detect channel-group headers (Premier League guides). When present,
    // render each group as a bold label on its own line with its channels
    // listed underneath, instead of one flat dot-separated caption.
    const channelLineStart = previousTitleBlock ? 0 : 1;
    const extraLines = absorbed
      .slice(channelLineStart)
      .map((a) => (a.textContent ?? "").trim())
      .filter(Boolean);
    const GROUP_HEADERS = [
      "EPL | Premier League",
      "EPL | Premier League Hub",
      "Other Channels",
    ];
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const isGroupHeader = (s: string) =>
      GROUP_HEADERS.some((h) => normalize(h) === normalize(s));
    let groupedChannels: { label: string; items: string[] }[] | null = null;
    if (extraLines.some(isGroupHeader)) {
      groupedChannels = [];
      let current: { label: string; items: string[] } | null = null;
      for (const line of extraLines) {
        if (isGroupHeader(line)) {
          current = { label: line, items: [] };
          groupedChannels.push(current);
        } else if (current) {
          current.items.push(line);
        } else {
          caption = caption ? `${caption} · ${line}` : line;
        }
      }
    }
    // Heuristic: short extra lines with no sentence punctuation are channel
    // names, not descriptive captions. Collected here and merged into the
    // channel chip list below so they render with bordered chip styling.
    const extraChannelLines: string[] = [];
    const splitChannelLine = (s: string) =>
      s.split(/\s*(?:[·•|]|\s[-–—]\s)\s*/).map((part) => part.trim()).filter(Boolean);
    if (!groupedChannels && extraLines.length) {
      const looksLikeChannel = (s: string) =>
        s.length > 0 && s.length <= 180 && !/[.!?]\s/.test(s);
      if (extraLines.every(looksLikeChannel)) {
        extraChannelLines.push(...extraLines.flatMap(splitChannelLine));
      } else {
        const extras = extraLines.join(" · ");
        if (extras) caption = caption ? `${caption} · ${extras}` : extras;
      }
    }
    for (const a of absorbed) {
      if (a.dataset.tzOriginal == null) {
        a.dataset.tzOriginal = a.innerHTML;
        a.dataset.tzPrevClass = a.className;
      }
      a.setAttribute("data-tz-row", "1");
      a.className = "hidden";
    }
    if (previousTitleBlock) {
      if (previousTitleBlock.dataset.tzOriginal == null) {
        previousTitleBlock.dataset.tzOriginal = previousTitleBlock.innerHTML;
        previousTitleBlock.dataset.tzPrevClass = previousTitleBlock.className;
      }
      previousTitleBlock.setAttribute("data-tz-row", "1");
      previousTitleBlock.className = "hidden";
    }

    if (!eventName) eventName = "Event";

    // Preserve original markup so we can restore on re-run.
    block.dataset.tzOriginal = block.innerHTML;
    block.dataset.tzPrevClass = block.className;
    block.setAttribute("data-tz-row", "1");
    block.dataset.tzUtc = String(m.utcMs);
    if (rowSourceDate) block.dataset.tzSrcDate = rowSourceDate;
    block.className =
      "group not-prose list-none m-0 flex h-full min-h-[10rem] flex-col overflow-hidden p-5 rounded-2xl bg-[#1e0f35] border border-white/5 hover:bg-[#251242] hover:border-white/20 hover:shadow-2xl hover:shadow-purple-900/20 transition-all duration-300";

    block.innerHTML = "";

    // Preserve the complete event name. Punctuation such as colons, dashes,
    // bullets and pipes can be part of a legitimate title and must never be
    // used on its own to infer that part of the title is a channel.
    let channel = leadingChannel;
    const titleText = eventName;
    if (extraChannelLines.length) {
      const existing = channel ? channel.split(/\s*\|\s*/).filter(Boolean) : [];
      channel = [...existing, ...extraChannelLines].join(" | ");
    }
    const chanParts = channel ? channel.split(/\s*\|\s*/).filter(Boolean) : [];

    const ukDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(m.utcMs));
    const ukDateShort = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(m.utcMs));
    const ukTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(m.utcMs));
    const ukZone = tzAbbrev(m.utcMs, "Europe/London") || "UK";
    const localDiffers = m.localDate !== ukDate || m.localTime !== ukTime || m.localZone !== ukZone;
    const ukDayKey = dateInTimeZone(new Date(m.utcMs), "Europe/London");
    const localDayKey = dateInTimeZone(new Date(m.utcMs), viewerTz);
    const dayDifference = Math.round(
      (Date.parse(`${localDayKey}T00:00:00Z`) - Date.parse(`${ukDayKey}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000),
    );

    // Top row: channel badge on the left, compact time badges stacked right.
    const topRow = document.createElement("div");
    topRow.className = "flex items-center justify-between gap-3 mb-3";
    block.appendChild(topRow);

    // Multi-channel events list every channel in the "Available channels"
    // panel below — no top-left badge, so the first channel is never shown
    // twice. Single-channel events keep the plain top-left badge.
    if (chanParts.length === 1) {
      const badge = document.createElement("span");
      badge.className =
        "min-w-0 truncate px-2.5 py-1 rounded-md bg-purple-600/20 text-purple-300 text-xs font-bold tracking-wider uppercase border border-purple-500/30";
      badge.title = chanParts[0];
      badge.textContent = chanParts[0];
      topRow.appendChild(badge);
    } else {
      const spacer = document.createElement("span");
      topRow.appendChild(spacer);
    }

    // Times sit side by side, each time joined with its own date on one
    // line, separated by a glowing divider so the split pops out.
    const timeCol = document.createElement("div");
    timeCol.className = "flex items-center gap-2 shrink-0 whitespace-nowrap";
    topRow.appendChild(timeCol);

    const ukGroup = document.createElement("div");
    ukGroup.className = "flex items-center gap-1.5 whitespace-nowrap";
    const ukBadge = document.createElement("span");
    ukBadge.setAttribute("data-tz-pill", "1");
    ukBadge.className =
      "px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-900 text-[10px] font-extrabold uppercase tabular-nums shadow-sm";
    ukBadge.textContent = `${ukTime} ${ukZone}`;
    ukGroup.appendChild(ukBadge);
    const ukDateSpan = document.createElement("span");
    ukDateSpan.className = "text-[10px] font-bold uppercase text-zinc-200";
    ukDateSpan.textContent = ukDateShort;
    ukGroup.appendChild(ukDateSpan);
    timeCol.appendChild(ukGroup);

    if (localDiffers) {
      // The glowing divider between UK and customer time.
      const divider = document.createElement("span");
      divider.setAttribute("aria-hidden", "true");
      divider.className =
        "h-5 w-0.5 rounded-full bg-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.9)]";
      timeCol.appendChild(divider);

      // Customer time and its local date share one line. When the converted
      // time falls on a different calendar day from UK time the date is
      // highlighted amber so the day difference is unmistakable.
      const localGroup = document.createElement("div");
      localGroup.className = "flex items-center gap-1.5 whitespace-nowrap";
      const localBadge = document.createElement("span");
      localBadge.setAttribute("data-tz-pill", "1");
      localBadge.className =
        "px-2 py-0.5 rounded-md bg-fuchsia-500 text-white text-[10px] font-extrabold uppercase tabular-nums shadow-sm shadow-fuchsia-900/60";
      localBadge.textContent = `${m.localTime} ${m.localZone}`;
      localGroup.appendChild(localBadge);
      const localDateShort = new Intl.DateTimeFormat("en-GB", {
        timeZone: viewerTz,
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(m.utcMs));
      const localDateSpan = document.createElement("span");
      localDateSpan.setAttribute("data-tz-day-notice", "1");
      localDateSpan.className = dayDifference !== 0
        ? "text-[10px] font-extrabold uppercase text-amber-300"
        : "text-[10px] font-bold uppercase text-zinc-200";
      localDateSpan.textContent = localDateShort;
      localGroup.appendChild(localDateSpan);
      timeCol.appendChild(localGroup);
    }

    // Event name beneath the top row.
    const nameEl = document.createElement("div");
    // data-tz-name marks the title so the reader can equalize its height per
    // grid row, keeping every card's channel list at the same start height.
    nameEl.setAttribute("data-tz-name", "1");
    nameEl.className =
      "min-w-0 break-words whitespace-normal min-h-[3rem] text-white font-semibold text-lg leading-tight group-hover:text-purple-200 transition-colors";
    nameEl.textContent = titleText;
    block.appendChild(nameEl);

    // Multi-channel events use a "broadcast matrix": a bordered panel under
    // the title holding every channel as a compact two-column grid, so 2-8
    // channels stay scannable instead of turning into a wrapping chip stack.
    if (chanParts.length > 1) {
      const matrix = document.createElement("div");
      matrix.className = "mt-3 rounded-lg border border-white/5 bg-black/20 p-2.5";

      const matrixHead = document.createElement("div");
      matrixHead.className =
        "mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-purple-300/80";
      const lineL = document.createElement("span");
      lineL.className = "h-px flex-1 bg-purple-900/50";
      const lineR = document.createElement("span");
      lineR.className = "h-px flex-1 bg-purple-900/50";
      const headText = document.createElement("span");
      headText.textContent = "Available channels";
      matrixHead.appendChild(lineL);
      matrixHead.appendChild(headText);
      matrixHead.appendChild(lineR);
      matrix.appendChild(matrixHead);

      const chanGrid = document.createElement("div");
      chanGrid.className = "grid grid-cols-2 gap-1.5";
      chanParts.forEach((part, idx) => {
        const item = document.createElement("div");
        item.className = idx === 0
          ? "flex min-w-0 items-center gap-2 rounded border border-purple-400/40 bg-purple-500/15 px-2 py-1.5"
          : "flex min-w-0 items-center gap-2 rounded border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-1.5 transition-colors hover:bg-fuchsia-500/20";
        const dot = document.createElement("span");
        dot.className = idx === 0
          ? "h-1.5 w-1.5 shrink-0 rounded-full bg-purple-300 shadow-[0_0_8px_rgba(216,180,254,0.8)]"
          : "h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.7)]";
        const label = document.createElement("span");
        label.className =
          "min-w-0 break-words text-[10px] font-semibold leading-tight text-white/90";
        label.textContent = part;
        item.appendChild(dot);
        item.appendChild(label);
        chanGrid.appendChild(item);
      });
      matrix.appendChild(chanGrid);

      if (groupedChannels && groupedChannels.length) {
        for (const g of groupedChannels) {
          const sec = document.createElement("div");
          sec.className = "mt-2 border-t border-white/5 pt-1.5 text-[10px] leading-snug";
          const lbl = document.createElement("div");
          lbl.className = "font-bold uppercase tracking-wider text-fuchsia-200/80";
          lbl.textContent = g.label;
          sec.appendChild(lbl);
          if (g.items.length) {
            const list = document.createElement("div");
            list.className = "text-purple-100/70";
            list.textContent = g.items.join(" · ");
            sec.appendChild(list);
          }
          matrix.appendChild(sec);
        }
      }

      block.appendChild(matrix);
    }
    if (caption) {
      const capEl = document.createElement("div");
      capEl.className = "mt-1.5 text-sm text-purple-100/80 break-words leading-snug";
      capEl.textContent = caption;
      block.appendChild(capEl);
    }
    // Single-channel events with no caption keep the plain top-left badge —
    // no matrix panel, matching the original one-channel card design.
    if (groupedChannels && groupedChannels.length && chanParts.length <= 1) {
      for (const g of groupedChannels) {
        const sec = document.createElement("div");
        sec.className = "mt-1.5 text-sm text-purple-100/80 break-words leading-snug";
        const lbl = document.createElement("div");
        lbl.className = "font-bold text-fuchsia-200";
        lbl.textContent = g.label;
        sec.appendChild(lbl);
        if (g.items.length) {
          const list = document.createElement("div");
          list.textContent = g.items.join(" · ");
          sec.appendChild(list);
        }
        block.appendChild(sec);
      }
    }

  }

  // Sort all transformed event rows by earliest source time.
  const eventRows = Array.from(
    root.querySelectorAll<HTMLElement>("[data-tz-row][data-tz-utc]"),
  );
  // Drop events whose start time is more than 10 hours in the past so old
  // listings auto-disappear from the guide without an editor needing to
  // manually prune them.
  const STALE_MS = 10 * 60 * 60 * 1000;
  const nowMs = Date.now();
  for (let i = eventRows.length - 1; i >= 0; i -= 1) {
    const row = eventRows[i];
    const utc = Number(row.dataset.tzUtc);
    let stale = Number.isFinite(utc) && nowMs - utc > STALE_MS;
    // Fallback: if the row's source date parsed correctly but the time was
    // mis-attached (e.g. parser fell back to today), still prune when the
    // entire source day ended more than STALE_MS ago. End-of-day is treated
    // as srcDate + 24h UTC — close enough across viewer time zones for a
    // 10-hour grace window.
    if (!stale) {
      const srcDate = row.dataset.tzSrcDate;
      if (srcDate && /^\d{4}-\d{2}-\d{2}$/.test(srcDate)) {
        const [y, mo, d] = srcDate.split("-").map(Number);
        const endOfDayMs = Date.UTC(y, mo - 1, d) + 24 * 60 * 60 * 1000;
        if (nowMs - endOfDayMs > STALE_MS) stale = true;
      }
    }
    if (stale) {
      row.remove();
      eventRows.splice(i, 1);
    }
  }
  if (eventRows.length >= 1) {
    // Anchor at the first row's top-level ancestor within root, then reparent
    // every row to be a direct child of `root`. This bypasses editor wrappers
    // (grids, columns, extra divs) so rows always stack vertically full-width.
    const topAncestor = (el: HTMLElement): HTMLElement => {
      let cur: HTMLElement = el;
      while (cur.parentElement && cur.parentElement !== root) cur = cur.parentElement;
      return cur;
    };
    const anchorEl = topAncestor(eventRows[0]);
    const placeholder = document.createComment("tz-sort-anchor");
    root.insertBefore(placeholder, anchorEl);
    const sorted = [...eventRows].sort(
      (a, b) => Number(a.dataset.tzUtc) - Number(b.dataset.tzUtc),
    );
    for (const el of sorted) {
      el.remove();
      root.insertBefore(el, placeholder);
    }
    placeholder.remove();
  }
}
