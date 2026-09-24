import { parseClockTime, parseListingDate, sourceTimeToUk, sourceTimeToUkParts, ukListingInstant, ukTodayParts, type TimeZoneChoice } from "./import-time";

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
// Posts are typed by hand, so tolerate the common am/pm typos ("12:15an",
// "7:30pn") when the meridiem follows a hh:mm clock.
const TIME_SOURCE = String.raw`\d{1,2}(?::|\.)\d{2}\s*(?:am|pm|an|pn|a\.m\.|p\.m\.)?|\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)`;
const TIME_WITH_ZONE_SOURCE = String.raw`(?:${TIME_SOURCE})(?:\s*(?:${ZONE}))?`;
// Accept the short labels providers actually use (TUE/TUES, WED/WEDS,
// THU/THURS) as well as full weekday names.
const WEEKDAY_HINT_SOURCE = String.raw`(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)`;
// A single kick-off may still name the day it belongs to ("12:00am UK THU").
const TIME_ONLY_RE = new RegExp(`^\\s*(${TIME_WITH_ZONE_SOURCE}(?:\\s+${WEEKDAY_HINT_SOURCE})?)\\s*$`, "i");
const DUAL_TIME_ONLY_RE = new RegExp(
  `^\\s*(${TIME_WITH_ZONE_SOURCE}(?:\\s+${WEEKDAY_HINT_SOURCE})?\\s*(?:·|\\||/)\\s*${TIME_WITH_ZONE_SOURCE}(?:\\s+${WEEKDAY_HINT_SOURCE})?)\\s*$`,
  "i",
);
const TIME_FIRST_RE = new RegExp(
  `^\\s*(${TIME_WITH_ZONE_SOURCE}(?:\\s+${WEEKDAY_HINT_SOURCE})?)\\s*(?:[-–—:|·•]\\s*)?(.+?)\\s*$`,
  "i",
);
const LEADING_ZONE_TIME_RE = new RegExp(`^\\s*(${ZONE})\\s+(${TIME_SOURCE})\\s*(?:[-–—:|·•]\\s*)?(.+?)\\s*$`, "i");
const CHANNEL_TIME_RE = new RegExp(`^\\s*(.{2,70}?)\\s*(?:\\||·|•|[-–—])\\s*(${TIME_WITH_ZONE_SOURCE})\\s+(.+?)\\s*$`, "i");
const CHANNEL_SPACE_TIME_RE = new RegExp(`^\\s*([A-Za-z][A-Za-z0-9 +&'/.:-]{1,42}\\d{1,3})\\s+(${TIME_WITH_ZONE_SOURCE})\\s+(.+?)\\s*$`, "i");
// Provider dumps put the title on its own line and the slot underneath:
// "- 23-09-2026 8:30 PM until 24-09-2026 12:00 AM - PEACOCK 8 HD"
const DATE_SOURCE = String.raw`\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}`;
const DATE_TIME_SPAN_RE = new RegExp(
  `^\\s*(${DATE_SOURCE})\\s+(${TIME_WITH_ZONE_SOURCE})\\s+(?:until|till|to|[-–—])\\s+(?:${DATE_SOURCE}\\s+)?(?:${TIME_WITH_ZONE_SOURCE})\\s*(?:[-–—|·•]\\s*(.+?))?\\s*$`,
  "i",
);
const DATE_ONLY_RE = new RegExp(
  `^\\s*(?:(?:${ZONE})\\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\b[\\s,]+)?(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.](?:\\d{2}|\\d{4})|\\d{1,2}(?:st|nd|rd|th)?\\s+[a-z]+(?:\\s+(?:\\d{2}|\\d{4}))?|[a-z]+\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+(?:\\d{2}|\\d{4}))?)(?:\\s+(?:${ZONE}))?\\s*$`,
  "i",
);

function cleanLine(line: string): string {
  return line
    .replace(/\r/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^[\s•·●○▪▫■□★☆✅☑️-]+/u, "")
    .replace(/\s+/g, " ")
    // Some posts end the date line with a full stop ("Sunday 20-09-26.").
    .replace(/[.,;:]+$/, "")
    .trim();
}

function decodeListingEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/**
 * Daily listings lead each row with the channel number ("01 | 00:00 Trackside
 * Live!"). Keep that number as the event's channel.
 */
// Only "|" or ")" count as the channel-number separator — using ":" or "." here
// would read a kick-off time like "8:00pm UK / 3:00pm ET" as "channel 8".
const CHANNEL_NUMBER_TIME_RE = new RegExp(
  `^\\s*(\\d{1,3})\\s*[|)]\\s*(${TIME_WITH_ZONE_SOURCE})\\s+(.+?)\\s*$`,
  "i",
);

/**
 * Same daily rows, but with the kick-off time at the end of the line instead of
 * the start ("07 | MMA: IBC 05 10:00").
 */
const CHANNEL_NUMBER_TITLE_TIME_RE = new RegExp(
  `^\\s*(\\d{1,3})\\s*[|)]\\s*(.+?)\\s*[-–—|·•]?\\s*(${TIME_WITH_ZONE_SOURCE})\\s*$`,
  "i",
);

/**
 * Named feeds number their channels after the feed name and then dash into the
 * kick-off: "NHL | 01 - 7pm Maple Leafs at Senators". Keep "NHL 01" as the
 * channel, the clock as the kick-off and the rest as the fixture.
 */
const CHANNEL_NAME_NUMBER_TIME_RE = new RegExp(
  `^\\s*([A-Za-z][A-Za-z0-9 +&'./]{1,30}?)\\s*[|)]\\s*(\\d{1,3})\\s*[-–—|:•·]\\s*(${TIME_WITH_ZONE_SOURCE})\\s+(.+?)\\s*$`,
  "i",
);

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

/**
 * Some multi-sport posts put the shared date after a section title, for
 * example "OTHER SPORT: WEDNESDAY 23 SEPTEMBER". Keep only the date portion
 * so every split event retains the day without importing the section title.
 */
function listingDateFromLine(line: string): string | null {
  if (isDateLine(line)) return line;
  const embedded = line.match(
    /\b((?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)[\s,]+\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+(?:\s+(?:\d{2}|\d{4}))?)\s*$/i,
  )?.[1];
  if (!embedded) return null;
  const parsed = parseListingDate(embedded);
  if (!parsed) return null;
  return formatListingDate(new Date(Date.UTC(parsed.y, parsed.m, parsed.d)));
}

function normalizeTime(time: string): string {
  return time.replace(/^(\d{1,2})\.(\d{2}\b)/, "$1:$2").replace(/\s+/g, " ").trim();
}

/**
 * "5:00pm UK / 12:00pm ET" — keep one time only: the UK one when the post
 * gives it, otherwise the first listed.
 */
function pickPrimaryTime(value: string): string {
  return pickPrimaryTimePart(value).time;
}

const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const TRAILING_WEEKDAY_RE = new RegExp(`\\s+(${WEEKDAY_HINT_SOURCE})\\s*$`, "i");

/**
 * "12:00am UK THU / 7:00pm ET WED" — keep the UK kick-off and remember the
 * weekday the post attached to it, so the event lands on Thursday rather than
 * the heading's Wednesday.
 */
function pickPrimaryTimePart(value: string): { time: string; weekday: number | null } {
  const parts = value.split(/\s*(?:·|\||\/)\s*/).map((part) => part.trim()).filter(Boolean);
  const chosen = parts.find((part) => /\b(?:uk|gmt|bst)\b/i.test(part)) ?? parts[0] ?? value;
  const hint = chosen.match(TRAILING_WEEKDAY_RE)?.[1];
  const weekday = hint ? WEEKDAY_NAMES.indexOf(hint.slice(0, 3).toLowerCase()) : -1;
  return {
    time: normalizeTime(chosen.replace(TRAILING_WEEKDAY_RE, "")),
    weekday: weekday >= 0 ? weekday : null,
  };
}

/** Move a listing date forward to the next occurrence of the given weekday. */
function dateOnWeekday(dateLabel: string | null, weekday: number | null): string | null {
  if (!dateLabel || weekday === null) return dateLabel;
  const parsed = parseListingDate(dateLabel);
  if (!parsed) return dateLabel;
  const date = new Date(Date.UTC(parsed.y, parsed.m, parsed.d));
  const delta = (weekday - date.getUTCDay() + 7) % 7;
  if (!delta) return dateLabel;
  date.setUTCDate(date.getUTCDate() + delta);
  return formatListingDate(date);
}

/**
 * A listing whose only day marker is the weekday on the kick-off ("12:00am UK
 * THU") still belongs on that weekday, counting from the post's heading date
 * or, when it has none, from the import day.
 */
function resolveWeekdayDate(date: string | null, weekday: number | null): string | null {
  if (weekday === null) return date;
  return dateOnWeekday(date ?? importDayListingDate(), weekday);
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
  const parts = withoutLabel.split(/\s*(?:\||·|•|,|;|\/\/|\/|\s[-–—]\s)\s*|\s+(?:\+|&|and)\s+/i);
  let numberedPrefix: string | null = null;

  const expanded = parts.map((part) => {
    const clean = part.trim();
    const prefixedNumber = clean.match(/^(.*?\D\s*)(\d{1,3})$/);
    if (prefixedNumber?.[1]) {
      numberedPrefix = prefixedNumber[1].trimEnd();
      return clean;
    }
    if (numberedPrefix && /^\d{1,3}$/.test(clean)) {
      return `${numberedPrefix} ${clean}`;
    }
    numberedPrefix = null;
    return clean;
  });

  return unique(expanded);
}

/**
 * Normalise the complete channel list together so a prefix can carry across
 * parser-produced entries as well as across text on one line.
 */
function normalizeChannels(channels: string[]): string[] {
  return channels.length ? splitChannelLine(channels.join(" | ")) : [];
}

export function normalizeSportsEventTitle(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+(?:x|vs\.?|v\.?)\s+/gi, " & ")
    .replace(/\s*&\s*/g, " & ")
    .trim();
}

export function isLikelyChannelLabel(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > 70) return false;
  if (/\b(?:v|vs|versus)\b/i.test(text)) return false;
  if (/\b(?:league|cup|trophy|championship|premier|serie|liga|bundesliga)\b/i.test(text) && !/\d/.test(text)) return false;
  // Provider feeds frequently use an unfamiliar name followed by a channel
  // number ("Coupang 1", "MonoMax 7", "Ten 2"). Treat that compact shape as
  // a channel without maintaining a provider allow-list. Exclude common event
  // labels so titles such as "Formula 1" can still sit above their start time.
  if (
    /^(?:[A-Za-z][A-Za-z0-9+.'-]*\s+){1,3}\d{1,3}$/i.test(text) &&
    !/\b(?:formula|round|race|practice|qualifying|session|stage|day|match|game)\b/i.test(text)
  ) return true;
  if (/^(?:EFL)\s*\d{1,3}\b/i.test(text)) return true;
  if (/^(?:MLB|NHL|MLS|WNBA|NBA|NFL)\s*\d{1,3}\b/i.test(text)) return true;
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
  if (dash && dash[1] && dash[2] && isLikelyChannelLabel(dash[1])) {
    return { title: dash[2].trim(), channels: splitChannelLine(dash[1]) };
  }
  if (dash && dash[1] && dash[2] && isLikelyChannelLabel(dash[2])) {
    return { title: dash[1].trim(), channels: splitChannelLine(dash[2]) };
  }

  return { title: clean, channels: [] };
}

/**
 * League feeds write one row per fixture as
 * "LOI 1 | Dundalk v Wexford // UK Wed 23 Sep 7:30pm // ET Wed 23 Sep 2:30pm".
 * Keep the channel, the fixture and the UK kick-off only; the competition
 * heading above the row ("IRE | League of Ireland") is not an event.
 */
const SLASH_ZONE_SEGMENT_RE = new RegExp(`^(${ZONE})\\b\\s*(.+)$`, "i");

function detectSlashZonedEvent(line: string, date: string | null): SportsListingEvent | null {
  if (!line.includes("//")) return null;
  const segments = line.split(/\s*\/\/\s*/).map((part) => part.trim()).filter(Boolean);
  if (segments.length < 2) return null;

  const head = segments[0];
  if (!head) return null;

  const zoned = segments
    .slice(1)
    .map((segment) => segment.match(SLASH_ZONE_SEGMENT_RE))
    .filter((match): match is RegExpMatchArray => Boolean(match?.[1] && match?.[2]));
  if (!zoned.length) return null;

  const chosen = zoned.find((match) => /^(?:uk|gmt|bst)$/i.test(match[1]!)) ?? zoned[0]!;
  const zone = chosen[1]!;
  const rest = chosen[2]!;
  const time = rest.match(new RegExp(`(${TIME_SOURCE})`, "i"))?.[1];
  if (!time) return null;

  const parsedDate = parseListingDate(rest.replace(new RegExp(`${TIME_SOURCE}`, "gi"), " "));
  const eventDate = parsedDate
    ? formatListingDate(new Date(Date.UTC(parsedDate.y, parsedDate.m, parsedDate.d)))
    : date;

  // Some providers separate the channel from the fixture with a spaced colon
  // ("Stan 01 : Singapore: Day 3 - WTA 500") instead of a pipe.
  const parts = head.split(/\s*(?:\||·|•)\s*|\s+:\s+/).map((part) => part.trim()).filter(Boolean);
  const titlePart = parts.find((part) => /\bv(?:s|ersus)?\b/i.test(part)) ?? parts[parts.length - 1] ?? head;
  const channels = unique(parts.filter((part) => part !== titlePart));

  return {
    date: eventDate,
    time: normalizeTime(`${time} ${zone}`),
    title: titlePart,
    channels,
  };
}

/**
 * Provider rows carry the slot as a UTC stamp instead of a clock time:
 * "Stan 01 : Singapore: Day 3 - WTA 500 start:2026-09-23 05:59:29 stop:...".
 */
const PROVIDER_STAMP_RE = /\bstart:\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/i;
const NAMED_PROVIDER_STAMP_HEAD_RE = /^([a-z][a-z0-9 +&'./-]*?)\s*:\s*(\d{1,3})\s+name\s*:\s*(.+)$/i;
const PROVIDER_CHANNEL_STAMP_HEAD_RE = /^([a-z][a-z0-9 +&'./-]*?\s+\d{1,3})\s*:\s*(.+)$/i;

function detectStampedEvent(line: string, date: string | null): SportsListingEvent | null {
  const stamp = line.match(PROVIDER_STAMP_RE);
  if (!stamp) return null;
  const head = line
    .replace(/\b(?:start|stop):\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?/gi, " ")
    .replace(/\bstatus:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[-–—|·•:\s]+$/, "")
    .trim();
  if (!head) return null;

  const [, y, m, d, hh, mm] = stamp;
  // Provider timestamps are UTC instants. Convert both their date and clock to
  // UK office time here; treating "00:50" as a London wall clock loses the BST
  // hour and can also leave a late-night event on the wrong day.
  const when = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
  const ukParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const ukPart = (type: string) => Number(ukParts.find((part) => part.type === type)?.value ?? "0");
  const eventDate = formatListingDate(new Date(Date.UTC(ukPart("year"), ukPart("month") - 1, ukPart("day"))));
  const ukZone = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "short" })
    .formatToParts(when)
    .find((part) => part.type === "timeZoneName")?.value === "BST" ? "BST" : "GMT";

  const namedProvider = head.match(NAMED_PROVIDER_STAMP_HEAD_RE);
  if (namedProvider?.[1] && namedProvider[2] && namedProvider[3]) {
    return {
      date: eventDate || date,
      time: `${String(ukPart("hour") % 24).padStart(2, "0")}:${String(ukPart("minute")).padStart(2, "0")} ${ukZone}`,
      title: namedProvider[3].trim(),
      channels: [`${namedProvider[1].trim()} ${namedProvider[2]}`],
    };
  }

  const providerChannel = head.match(PROVIDER_CHANNEL_STAMP_HEAD_RE);
  if (providerChannel?.[1] && providerChannel[2] && isLikelyChannelLabel(providerChannel[1])) {
    return {
      date: eventDate || date,
      time: `${String(ukPart("hour") % 24).padStart(2, "0")}:${String(ukPart("minute")).padStart(2, "0")} ${ukZone}`,
      title: providerChannel[2].trim(),
      channels: splitChannelLine(providerChannel[1]),
    };
  }

  const parts = head.split(/\s*(?:\||·|•)\s*|\s+:\s+/).map((part) => part.trim()).filter(Boolean);
  const channels = parts.filter((part) => isLikelyChannelLabel(part));
  const title = parts.filter((part) => !channels.includes(part)).join(" - ") || head;

  return {
    date: eventDate || date,
    time: `${String(ukPart("hour") % 24).padStart(2, "0")}:${String(ukPart("minute")).padStart(2, "0")} ${ukZone}`,
    title,
    channels: unique(channels),
  };
}

/**
 * Season-pass rows put the fixture first, then the slot after an "@" and the
 * channel after a colon:
 * "Seattle Sounders FC vs Real Salt Lake @ Sep 23 9:30 PM :MLS  01".
 */
const AT_DATE_TIME_CHANNEL_RE = new RegExp(
  String.raw`^\s*(.+?)\s*@\s*((?:[a-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}\.?|` +
    DATE_SOURCE +
    String.raw`)(?:,?\s+\d{4})?)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?(?:\s*(?:` +
    ZONE +
    String.raw`))?)(?:\s+[-–—]\s+([^:|·•]+?))?\s*[:|·•]\s*(.+?)\s*$`,
  "i",
);

function detectAtSlotEvent(line: string, date: string | null): SportsListingEvent | null {
  const match = line.match(AT_DATE_TIME_CHANNEL_RE);
  if (!match?.[1] || !match[2] || !match[3] || !match[5]) return null;
  const parsed = parseListingDate(match[2]);
  if (!parsed) return null;
  const clock = parseClockTime(match[3]);
  if (!clock) return null;
  // "13:40 PM" style rows: already 24h, drop the stray meridiem.
  const rawTime = /^\s*(1[3-9]|2[0-3])[:.]\d{2}\s*[ap]\.?m\.?/i.test(match[3])
    ? match[3].replace(/\s*[ap]\.?m\.?/i, "")
    : match[3];
  const competition = match[4]?.trim();
  const title = competition ? `${match[1].trim()} - ${competition}` : match[1].trim();
  return {
    date: formatListingDate(new Date(Date.UTC(parsed.y, parsed.m, parsed.d))),
    time: normalizeTime(rawTime),
    title,
    channels: splitChannelLine(match[5].replace(/\s+/g, " ")),
  };
}

function detectEvent(line: string, date: string | null): SportsListingEvent | null {
  // "UEFA 01 | 17:00 Andorra vs Malta" — channel, pipe, clock, event.
  const piped = line.match(/^([A-Za-z][A-Za-z0-9+&.' -]{0,30}?\s*\d{1,3})\s*\|\s*(\d{1,2}[:.]\d{2}(?:\s*[ap]m)?)\s+(.+)$/i);
  if (piped && piped[1] && piped[2] && piped[3]) {
    return {
      date,
      time: normalizeTime(piped[2].replace(".", ":")),
      title: normalizeSportsEventTitle(piped[3].trim()),
      channels: [piped[1].trim().replace(/\s+/g, " ")],
    };
  }

  const atSlot = detectAtSlotEvent(line, date);
  if (atSlot) return atSlot;

  const stamped = detectStampedEvent(line, date);
  if (stamped) return stamped;

  const slashZoned = detectSlashZonedEvent(line, date);
  if (slashZoned) return slashZoned;

  const span = line.match(DATE_TIME_SPAN_RE);
  if (span && span[1] && span[2]) {
    return {
      date: span[1],
      time: normalizeTime(span[2]),
      title: "",
      channels: span[3] ? splitChannelLine(span[3]) : [],
    };
  }

  const namedNumbered = line.match(CHANNEL_NAME_NUMBER_TIME_RE);
  if (namedNumbered && namedNumbered[1] && namedNumbered[2] && namedNumbered[3] && namedNumbered[4]) {
    const lead = pickPrimaryTimePart(namedNumbered[3]);
    const split = splitTitleAndInlineChannels(namedNumbered[4]);
    return {
      date: resolveWeekdayDate(date, lead.weekday),
      time: lead.time,
      title: split.title,
      channels: unique([`${namedNumbered[1].trim()} ${namedNumbered[2]}`, ...split.channels]),
    };
  }

  const numberedChannel = line.match(CHANNEL_NUMBER_TIME_RE);
  if (numberedChannel && numberedChannel[1] && numberedChannel[2] && numberedChannel[3]) {
    const split = splitTitleAndInlineChannels(numberedChannel[3]);
    return {
      date,
      time: normalizeTime(numberedChannel[2]),
      title: split.title,
      channels: unique([`Channel ${numberedChannel[1]}`, ...split.channels]),
    };
  }

  const numberedTrailingTime = line.match(CHANNEL_NUMBER_TITLE_TIME_RE);
  if (numberedTrailingTime && numberedTrailingTime[1] && numberedTrailingTime[2] && numberedTrailingTime[3]) {
    const split = splitTitleAndInlineChannels(numberedTrailingTime[2]);
    return {
      date,
      time: normalizeTime(numberedTrailingTime[3]),
      title: split.title,
      channels: unique([`Channel ${numberedTrailingTime[1]}`, ...split.channels]),
    };
  }

  const dualTimeOnly = line.match(DUAL_TIME_ONLY_RE);
  if (dualTimeOnly && dualTimeOnly[1]) {
    const primary = pickPrimaryTimePart(dualTimeOnly[1]);
    return { date: resolveWeekdayDate(date, primary.weekday), time: primary.time, title: "", channels: [] };
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
    const only = pickPrimaryTimePart(timeOnly[1]);
    return { date: resolveWeekdayDate(date, only.weekday), time: only.time, title: "", channels: [] };
  }

  const timeFirst = line.match(TIME_FIRST_RE);
  if (timeFirst && timeFirst[1] && timeFirst[2]) {
    const split = splitTitleAndInlineChannels(timeFirst[2]);
    const lead = pickPrimaryTimePart(timeFirst[1]);
    return { date: resolveWeekdayDate(date, lead.weekday), time: lead.time, title: split.title, channels: split.channels };
  }

  return null;
}

function finalized(event: SportsListingEvent): SportsListingEvent | null {
  const title = normalizeSportsEventTitle(event.title);
  if (!parseClockTime(event.time)) return null;
  if (!title) return null;
  // Never preserve the second half of a dual-zone kick-off as an event name.
  // This also removes malformed entries left in an existing guide by an older
  // import, such as "/ 12:00pm ET", when the guide is merged on re-import.
  if (new RegExp(`^\\/?\\s*${TIME_WITH_ZONE_SOURCE}\\s*$`, "i").test(title)) return null;
  // A channel-looking title is only junk when we have no channel of our own.
  if (!event.channels.length && isLikelyChannelLabel(title)) return null;
  return { ...event, title, channels: normalizeChannels(event.channels) };
}

export type ListingSection = { name: string; raw: string };

/**
 * One pasted post can carry several providers, each with its own guide:
 * "**MONOMAX**" rows followed by "**STAN Sport**" rows. Detect those headings
 * so the post can be filed as one import per provider.
 */
function isSectionHeading(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed) return false;
  const bold = /^(?:\*{2,}|__)(.+?)(?:\*{2,}|__)$/.test(trimmed);
  const text = cleanLine(trimmed);
  if (!text || text.length > 48) return false;
  if (text.includes("//")) return false;
  if (/\d{1,2}\s*[:.]\s*\d{2}/.test(text)) return false;
  if (isDateLine(text) || listingDateFromLine(text)) return false;
  if (detectEvent(text, null)) return false;
  const upper = text === text.toUpperCase() && /[A-Za-z]/.test(text);
  return bold || upper;
}

function listingLines(raw: string): string[] {
  return decodeListingEntities(raw)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n");
}

export function splitListingSections(raw: string | null | undefined): ListingSection[] {
  if (!raw) return [];
  const sections: ListingSection[] = [];
  let current: ListingSection | null = null;

  for (const line of listingLines(raw)) {
    if (isSectionHeading(line)) {
      current = { name: cleanLine(line), raw: "" };
      sections.push(current);
      continue;
    }
    if (current) current.raw += `${line}\n`;
  }

  // A provider counts even when its own rows need extra work later, so long
  // as it wrote something under its name.
  const filled = sections.filter((section) => section.raw.split("\n").some((line) => cleanLine(line)));
  return filled.length >= 2 ? filled : [];
}

export function parseSportsListingBlock(raw: string | null | undefined): SportsListingEvent[] {
  if (!raw) return [];
  const lines = decodeListingEntities(raw)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const events: SportsListingEvent[] = [];
  let currentDate: string | null = null;
  let current: SportsListingEvent | null = null;
  // Provider dumps name the programme on the line above its time slot.
  let previousPlainLine: string | null = null;
  let titleCameFromAbove = false;

  const flush = () => {
    if (!current) return;
    const done = finalized(current);
    if (done) events.push(done);
    current = null;
    titleCameFromAbove = false;
  };

  let lastChannelWasPlain: string | null = null;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const listingDate = listingDateFromLine(line);
    if (listingDate) {
      flush();
      currentDate = listingDate;
      previousPlainLine = null;
      continue;
    }
    if (isAlwaysNoiseLine(line)) continue;
    if (isNoiseLine(line) && !current) continue;

    const detected = detectEvent(line, currentDate);
    if (detected) {
      // "Azerbaijan : Practice 1" / "9:30am UK | 4:30am ET" / channels —
      // the title sits ABOVE a bare time line and channels follow below.
      const above = lastChannelWasPlain ?? previousPlainLine;
      // Once an event is already open, a plain line immediately before the
      // next bare clock is the next event's title (it was provisionally added
      // to the previous event's channels). For the first event, accept a
      // mixed-case title above the clock without requiring the following
      // channel to be one of our known broadcasters. This covers short or
      // unfamiliar channel names such as "Ten 2" while still keeping an
      // all-caps post heading above a time-first listing out of the title.
      // Guard: in a normal time → event → channel listing, the line above the
      // next clock is the previous event's channel. If the line BELOW the
      // clock is a matchup ("A & B", "A v B") and the line above isn't, the
      // line above is a channel, not a title.
      const MATCHUP_RE = /\s(?:&|v|vs|v\.|x|-)\s/i;
      const below = lines[li + 1] ?? "";
      const belowIsTitle = Boolean(below) && !detectEvent(below, currentDate) && MATCHUP_RE.test(below);
      const aboveIsTitle = Boolean(above) && MATCHUP_RE.test(above ?? "");
      const titleAboveTime = Boolean(
        !detected.title &&
        above &&
        !isLikelyChannelLabel(above) &&
        !(belowIsTitle && !aboveIsTitle) &&
        (lastChannelWasPlain || above !== above.toUpperCase()),
      );
      if (titleAboveTime && above) {
        if (lastChannelWasPlain && current && current.channels[current.channels.length - 1] === lastChannelWasPlain) {
          current.channels.pop();
        }
        flush();
        current = detected;
        current.title = above;
        previousPlainLine = null;
        lastChannelWasPlain = null;
        continue;
      }
      flush();
      current = detected;
      lastChannelWasPlain = null;
      // A title-above-time layout is specific to provider slot rows such as
      // "23-09-2026 8:30 PM until ...". For ordinary and dual-zone listings,
      // the line above is commonly the post heading (for example
      // "BILLIE JEAN KING CUP"), while the real event title follows the time.
      if (!current.title && previousPlainLine && DATE_TIME_SPAN_RE.test(line)) {
        current.title = previousPlainLine;
        titleCameFromAbove = true;
      }
      previousPlainLine = null;
      continue;
    }

    if (!current) {
      previousPlainLine = line;
      continue;
    }
    if (!current.title) {
      const split = splitTitleAndInlineChannels(line);
      current.title = split.title;
      current.channels.push(...split.channels);
      continue;
    }
    if (titleCameFromAbove) {
      // In this format the next plain line names the following programme.
      flush();
      previousPlainLine = line;
      continue;
    }
    const parts = splitChannelLine(line);
    current.channels.push(...parts);
    lastChannelWasPlain = parts.length === 1 ? parts[0] : null;
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

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

function formatListingDate(date: Date): string {
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long" }).format(date);
  return `${weekday}, ${ordinal(date.getUTCDate())} ${month}`;
}

/**
 * Daily channel lists may omit the second date and simply continue after
 * midnight (for example 23:00, 23:00, 4AM). Preserve that source order and
 * move entries after the clock rolls backwards onto the following date.
 */
function applyImplicitDateRollover(events: SportsListingEvent[], fallbackDate?: string | null): SportsListingEvent[] {
  const base = parseListingDate(fallbackDate);
  if (!base || events.some((event) => event.date)) return events;

  let dayOffset = 0;
  let previousMinutes: number | null = null;
  return events.map((event) => {
    const clock = parseClockTime(event.time);
    const minutes = clock ? clock.hour * 60 + clock.minute : null;
    if (minutes !== null && previousMinutes !== null && minutes < previousMinutes) dayOffset += 1;
    if (minutes !== null) previousMinutes = minutes;

    const date = new Date(Date.UTC(base.y, base.m, base.d + dayOffset));
    return { ...event, date: formatListingDate(date) };
  });
}

/** Times that already name a UK zone are never reinterpreted as ET. */
const UK_LABELLED_TIME_RE = /\b(uk|gmt|bst)\b/i;

function eventTimeForOutput(event: SportsListingEvent, input: ListingInput): string {
  if (UK_LABELLED_TIME_RE.test(event.time ?? "")) {
    return sourceTimeToUk(event.time, event.date ?? input.date ?? undefined, "gmt") ?? event.time;
  }
  if (input.sourceZone) {
    const converted = sourceTimeToUk(event.time, event.date ?? input.date ?? undefined, input.sourceZone);
    if (converted) return converted;
  }
  return event.time;
}

/**
 * Date a listing post should fall under when it never writes one: the day it
 * is imported, in UK office time. Times that run backwards after this are
 * rolled onto the following day by applyImplicitDateRollover.
 */
export function importDayListingDate(nowMs: number = Date.now()): string {
  const today = ukTodayParts(nowMs);
  return formatListingDate(new Date(Date.UTC(today.y, today.m, today.d)));
}

/**
 * Convert every event to UK time before sorting, moving the date with it.
 * "7pm" on an ET listing is 00:00 UK the next day, so the event must land on
 * the following day rather than staying on the listing's date.
 */
function convertEventsToUk(events: SportsListingEvent[], input: ListingInput): SportsListingEvent[] {
  return events.map((event) => {
    const labelled = UK_LABELLED_TIME_RE.test(event.time ?? "");
    const zone: TimeZoneChoice | null = labelled ? "gmt" : (input.sourceZone ?? null);
    if (!zone) return event;
    const date = event.date ?? input.date ?? null;
    const parts = sourceTimeToUkParts(event.time, date ?? undefined, zone);
    if (!parts) return event;

    let nextDate = date;
    if (parts.dayShift !== 0 && date) {
      const day = parseListingDate(date);
      if (day) nextDate = formatListingDate(new Date(Date.UTC(day.y, day.m, day.d + parts.dayShift)));
    }
    return { ...event, time: parts.time, date: nextDate };
  });
}

export function formatSportsListingBlock(input: ListingInput): string | null {
  const parsed = parseSportsListingBlock(input.raw);
  // No date written anywhere in the post: date it from the import day rather
  // than leaving the guide dateless for someone to fill in afterwards.
  const base = parsed.some((event) => event.date) ? input.date : (input.date ?? importDayListingDate());
  const dated = applyImplicitDateRollover(parsed, base);
  const events = sortSportsListingEvents(
    convertEventsToUk(dated, { ...input, date: base ?? input.date }),
  );
  if (!events.length) return null;

  return formatSportsListingEvents(events, { ...input, date: base ?? input.date });
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
    const channels = normalizeChannels([...(event.channels ?? []), ...((input.channels ?? []).filter(Boolean))]);
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
  // Each parsed event already owns its channels. Re-applying the incoming
  // event's channels here incorrectly adds them to every older guide entry.
  return events.length ? formatSportsListingEvents(events, { ...input, channels: [] }) : null;
}

export function escapeListingHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function plainListingToHtml(value: string): string {
  return decodeListingEntities(value)
    .split("\n")
    .map((line) => `<div>${line.trim() ? escapeListingHtml(line) : "<br>"}</div>`)
    .join("");
}

/** Guide entries clear this many hours after their start time. */
export const GUIDE_STALE_HOURS = 10;

/**
 * Drops guide entries whose start time passed more than GUIDE_STALE_HOURS ago
 * and rebuilds the remaining listing. Returns the new HTML body, or null when
 * nothing needs changing (including bodies that aren't plain listings).
 */
/** Compare two listing bodies ignoring wrapper markup and blank-line noise. */
function normalizeListingBody(html: string): string {
  return listingLines(html)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function pruneStaleSportsListingHtml(
  html: string | null | undefined,
  nowMs: number = Date.now(),
  // Listings that never wrote a date age from the day the guide last changed.
  fallbackDateMs?: number | null,
): string | null {
  if (!html || !html.trim()) return null;
  // Only plain time/event/channel listings are safe to rebuild.
  if (/data-link-preview|<img|<iframe|<video|<table/i.test(html)) return null;

  const events = parseSportsListingBlock(html);
  if (!events.length) return null;

  const cutoff = GUIDE_STALE_HOURS * 60 * 60 * 1000;
  const fallbackDate = typeof fallbackDateMs === "number" ? importDayListingDate(fallbackDateMs) : null;
  const kept = events.filter((event) => {
    const instant = ukListingInstant(event.date ?? fallbackDate, event.time);
    if (instant === null) return true;
    return nowMs - instant <= cutoff;
  });
  if (kept.length === events.length) return null;

  // Rebuilding drops anything that is not a time/event/channel row, so only
  // touch bodies that are exactly what our own formatter produces. Guides with
  // staff-written notes, headings or wording are left untouched.
  const roundTrip = plainListingToHtml(
    formatSportsListingEvents(sortSportsListingEvents(events), { channels: [] }),
  );
  if (normalizeListingBody(roundTrip) !== normalizeListingBody(html)) return null;

  if (!kept.length) return "";
  return plainListingToHtml(
    formatSportsListingEvents(sortSportsListingEvents(kept), { channels: [] }),
  );
}

/**
 * The date written in a post's headline (e.g. "Thursday 24 September" above
 * the listings). Used so split-off listings keep the original post's date.
 */
export function headlineListingDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lines = decodeListingEntities(raw)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 6);
  for (const line of lines) {
    const date = listingDateFromLine(line);
    if (date) return date;
  }
  return null;
}

/** True when a block already carries its own date line. */
export function listingBlockHasDate(raw: string): boolean {
  return raw.split("\n").map(cleanLine).some((line) => !!line && listingDateFromLine(line) !== null);
}
