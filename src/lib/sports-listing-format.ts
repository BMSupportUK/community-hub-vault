import { parseClockTime, parseListingDate, sourceTimeToUk, type TimeZoneChoice } from "./import-time";

export type SportsListingEvent = {
  date: string | null;
  time: string;
  title: string;
  channels: string[];
};

type ListingInput = {
  raw?: string | null;
  date?: string | null;
  time?: string | null;
  channels?: string[] | null;
  sourceZone?: TimeZoneChoice | null;
};

const ZONE = "GMT|UTC|UK|BST|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|CET|CEST|AEST|AEDT|JST|IST";
const TIME_SOURCE = String.raw`\d{1,2}(?::|\.)\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)`;
const TIME_WITH_ZONE_SOURCE = String.raw`(?:${TIME_SOURCE})(?:\s*(?:${ZONE}))?`;
const TIME_ONLY_RE = new RegExp(`^\\s*(${TIME_WITH_ZONE_SOURCE})\\s*$`, "i");
const DUAL_TIME_ONLY_RE = new RegExp(`^\\s*(${TIME_WITH_ZONE_SOURCE}\\s*(?:·|\\||/)\\s*${TIME_WITH_ZONE_SOURCE})\\s*$`, "i");
const TIME_FIRST_RE = new RegExp(`^\\s*(${TIME_WITH_ZONE_SOURCE})\\s*(?:[-–—:|·•]\\s*)?(.+?)\\s*$`, "i");
const LEADING_ZONE_TIME_RE = new RegExp(`^\\s*(${ZONE})\\s+(${TIME_SOURCE})\\s*(?:[-–—:|·•]\\s*)?(.+?)\\s*$`, "i");
const CHANNEL_TIME_RE = new RegExp(`^\\s*(.{2,70}?)\\s*(?:\\||·|•|[-–—])\\s*(${TIME_WITH_ZONE_SOURCE})\\s+(.+?)\\s*$`, "i");
const CHANNEL_SPACE_TIME_RE = new RegExp(`^\\s*([A-Za-z][A-Za-z0-9 +&'/.:-]{1,42}\\d{1,3})\\s+(${TIME_WITH_ZONE_SOURCE})\\s+(.+?)\\s*$`, "i");
const DATE_ONLY_RE = new RegExp(
  `^\\s*(?:(?:${ZONE})\\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\b[\\s,]+)?(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.](?:\\d{2}|\\d{4})|\\d{1,2}(?:st|nd|rd|th)?\\s+[a-z]+(?:\\s+(?:\\d{2}|\\d{4}))?|[a-z]+\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+(?:\\d{2}|\\d{4}))?)(?:\\s+(?:${ZONE}))?\\s*$`,
  "i",
);

function cleanLine(line: string): string {
  return stripListIndex(
    line
      .replace(/\r/g, "")
      .replace(/[*_`#>]+/g, "")
      .replace(/^[\s•·●○▪▫■□★☆✅☑️-]+/u, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Telegram listings number each row ("01 |   19:45 KDM Trophy"). Drop that
 * index so the row parses as a normal time-first event line — but only when a
 * clock time follows, so real channel numbers ("EFL 01 | 19:00 ...") survive.
 */
const LIST_INDEX_RE = new RegExp(`^\\d{1,3}\\s*[|).:\\-–—]\\s*(?=(?:${TIME_WITH_ZONE_SOURCE})\\b)`, "i");

function stripListIndex(line: string): string {
  return line.replace(LIST_INDEX_RE, "").trim();
}

function isNoiseLine(line: string): boolean {
  if (!line) return true;
  if (parseClockTime(line)) return false;
  return /^(?:fixtures?|listings?|streams?|schedule|today'?s?\s+sport|live\s+sport|events?|channels?|coverage|please note|auto[-\s]?delete|posted by)\b/i.test(line);
}

/** Boilerplate that must never become a title or a channel. */
function isAlwaysNoiseLine(line: string): boolean {
  return /^(?:please\s+(?:update|refresh|check)|update\s+your\s+playlist|today'?s\s+live\s+events|all\s+times?\b.*\b(?:uk|gmt|bst|et)\b)/i.test(line);
}

function isDateLine(line: string): boolean {
  return DATE_ONLY_RE.test(line) && parseListingDate(line) !== null;
}

function normalizeTime(time: string): string {
  return time.replace(/^(\d{1,2})\.(\d{2}\b)/, "$1:$2").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").replace(/^[|·•,;:\s]+|[|·•,;:\s]+$/g, "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function splitChannelLine(line: string): string[] {
  const withoutLabel = line.replace(/^channels?\s*[:|-]\s*/i, "").trim();
  return unique(withoutLabel.split(/\s*(?:\||·|•|,|;|\/\/|\/|\s[-–—]\s)\s*|\s+(?:\+|&|and)\s+/i));
}

export function isLikelyChannelLabel(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > 70) return false;
  if (/\b(?:v|vs|versus)\b/i.test(text)) return false;
  if (/\b(?:league|cup|trophy|championship|premier|serie|liga|bundesliga)\b/i.test(text) && !/\d/.test(text)) return false;
  if (/^(?:EFL)\s*\d{1,3}\b/i.test(text)) return true;
  if (/\b(?:sky|tnt|bt|espn|dazn|cbs|fox|nbc|abc|itv|bbc|bein|viaplay|premier\s+sports|eurosport|fubo|peacock|paramount|amazon|apple|arena|supersport|sportsnet|tsn|optus|stan|setanta|flow|flo|racing\s*tv|channel|sports?|hd|uhd|feed)\b/i.test(text)) return true;
  return false;
}

function splitTitleAndInlineChannels(rest: string): { title: string; channels: string[] } {
  const clean = rest.replace(/\s+/g, " ").trim();
  if (!clean) return { title: "Event", channels: [] };

  const pipeParts = clean.split(/\s*(?:\||·|•)\s*/).filter(Boolean);
  if (pipeParts.length > 1) {
    const [first, ...remaining] = pipeParts;
    const title = first?.trim() || "Event";
    return { title, channels: unique(remaining.flatMap(splitChannelLine)) };
  }

  const dash = clean.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dash && dash[1] && dash[2] && isLikelyChannelLabel(dash[2])) {
    return { title: dash[1].trim(), channels: splitChannelLine(dash[2]) };
  }

  return { title: clean, channels: [] };
}

function detectEvent(line: string, date: string | null): SportsListingEvent | null {
  const dualTimeOnly = line.match(DUAL_TIME_ONLY_RE);
  if (dualTimeOnly && dualTimeOnly[1]) {
    return { date, time: normalizeTime(dualTimeOnly[1]), title: "", channels: [] };
  }

  const leadingZone = line.match(LEADING_ZONE_TIME_RE);
  if (leadingZone && leadingZone[1] && leadingZone[2] && leadingZone[3]) {
    const split = splitTitleAndInlineChannels(leadingZone[3]);
    return { date, time: normalizeTime(`${leadingZone[2]} ${leadingZone[1]}`), title: split.title, channels: split.channels };
  }

  const channelTime = line.match(CHANNEL_TIME_RE) ?? line.match(CHANNEL_SPACE_TIME_RE);
  if (channelTime && channelTime[1] && channelTime[2] && channelTime[3] && isLikelyChannelLabel(channelTime[1])) {
    const split = splitTitleAndInlineChannels(channelTime[3]);
    return {
      date,
      time: normalizeTime(channelTime[2]),
      title: split.title,
      channels: unique([channelTime[1], ...split.channels]),
    };
  }

  const timeOnly = line.match(TIME_ONLY_RE);
  if (timeOnly && timeOnly[1]) {
    return { date, time: normalizeTime(timeOnly[1]), title: "", channels: [] };
  }

  const timeFirst = line.match(TIME_FIRST_RE);
  if (timeFirst && timeFirst[1] && timeFirst[2]) {
    const split = splitTitleAndInlineChannels(timeFirst[2]);
    return { date, time: normalizeTime(timeFirst[1]), title: split.title, channels: split.channels };
  }

  return null;
}

function finalized(event: SportsListingEvent): SportsListingEvent | null {
  const title = event.title.replace(/\s+/g, " ").trim();
  if (!parseClockTime(event.time)) return null;
  if (!title || isLikelyChannelLabel(title)) return null;
  return { ...event, title, channels: unique(event.channels) };
}

export function parseSportsListingBlock(raw: string | null | undefined): SportsListingEvent[] {
  if (!raw) return [];
  const lines = raw
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const events: SportsListingEvent[] = [];
  let currentDate: string | null = null;
  let current: SportsListingEvent | null = null;

  const flush = () => {
    if (!current) return;
    const done = finalized(current);
    if (done) events.push(done);
    current = null;
  };

  for (const line of lines) {
    if (isDateLine(line)) {
      flush();
      currentDate = line;
      continue;
    }
    if (isNoiseLine(line) && !current) continue;

    const detected = detectEvent(line, currentDate);
    if (detected) {
      flush();
      current = detected;
      continue;
    }

    if (!current) continue;
    if (!current.title) {
      current.title = line;
      continue;
    }
    current.channels.push(...splitChannelLine(line));
  }
  flush();

  return events;
}

function eventSortValue(event: SportsListingEvent, index: number): number {
  const clock = parseClockTime(event.time);
  if (!clock) return Number.MAX_SAFE_INTEGER - 10_000 + index;
  return clock.hour * 60 + clock.minute;
}

/**
 * Keep each imported listing as time → event → channels, ordered by start
 * time. Equal kick-off times retain the source channel order.
 */
export function sortSportsListingEvents(events: SportsListingEvent[]): SportsListingEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const aDate = parseListingDate(a.event.date);
      const bDate = parseListingDate(b.event.date);
      if (aDate && bDate) {
        const dateDifference = Date.UTC(aDate.y, aDate.m, aDate.d) - Date.UTC(bDate.y, bDate.m, bDate.d);
        if (dateDifference !== 0) return dateDifference;
      }
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      const timeDifference = eventSortValue(a.event, a.index) - eventSortValue(b.event, b.index);
      return timeDifference || a.index - b.index;
    })
    .map(({ event }) => event);
}

function eventTimeForOutput(event: SportsListingEvent, input: ListingInput): string {
  if (input.sourceZone) {
    const converted = sourceTimeToUk(event.time, event.date ?? input.date ?? undefined, input.sourceZone);
    if (converted) return converted;
  }
  return event.time;
}

export function formatSportsListingBlock(input: ListingInput): string | null {
  const events = sortSportsListingEvents(parseSportsListingBlock(input.raw));
  if (!events.length) return null;

  return formatSportsListingEvents(events, input);
}

function formatSportsListingEvents(events: SportsListingEvent[], input: ListingInput): string {
  const out: string[] = [];
  let lastDate: string | null = null;
  for (const event of events) {
    const date = event.date ?? input.date ?? null;
    if (date && date !== lastDate) {
      if (out.length) out.push("");
      out.push(date);
      out.push("");
      lastDate = date;
    } else if (out.length) {
      out.push("");
    }

    out.push(eventTimeForOutput(event, input));
    out.push(event.title);
    const channels = unique([...(event.channels ?? []), ...((input.channels ?? []).filter(Boolean))]);
    if (channels.length) out.push(channels.join(" | "));
  }

  return out.join("\n").trim();
}

/** Rebuild an existing guide plus a new import into one sorted event list. */
export function mergeSportsListingBlocks(existing: string, incoming: string, input: Omit<ListingInput, "raw">): string | null {
  const events = sortSportsListingEvents([
    ...parseSportsListingBlock(existing),
    ...parseSportsListingBlock(incoming),
  ]);
  return events.length ? formatSportsListingEvents(events, input) : null;
}

export function escapeListingHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function plainListingToHtml(value: string): string {
  return value
    .split("\n")
    .map((line) => `<div>${line.trim() ? escapeListingHtml(line) : "<br>"}</div>`)
    .join("");
}
