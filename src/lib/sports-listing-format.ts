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
  guideTitle?: string | null;
  nowMs?: number;
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
// Game-pass rows put the channel first, then the fixture, with the start time
// at the end: "NFL01: Falcons @ Packers 01:15". The provider header above it
// ("US | NFL Sunday Ticket") is context only and must never become the event.
const CHANNEL_COLON_TITLE_TIME_RE = new RegExp(
  `^\\s*([A-Za-z][A-Za-z0-9 +&'./-]*?\\d{1,3})\\s*:\\s*(.+?)\\s+(${TIME_WITH_ZONE_SOURCE})\\s*$`,
  "i",
);
// Numbered feeds may append an explanatory note after the kick-off:
// "Rugby Pass 03: The 745 Game 17:45 (Raise Awareness and Funds ...)".
// Keep that note in the event name instead of treating the row as a channel.
const CHANNEL_COLON_TITLE_TIME_NOTE_RE = new RegExp(
  String.raw`^\s*([A-Za-z][A-Za-z0-9 +&'./-]*?\d{1,3})\s*:\s*(.+?)\s+(${TIME_WITH_ZONE_SOURCE})\s+(\(.+\))\s*$`,
  "i",
);
// Channel, colon, then time first: "Super League Plus 01:  20:00 Leeds Rhinos vs Warrington Wolves".
const CHANNEL_COLON_TIME_TITLE_RE = new RegExp(
  `^\\s*([A-Za-z][A-Za-z0-9 +&'./-]*?\\d{1,3})\\s*:\\s*(${TIME_WITH_ZONE_SOURCE})\\s+(.+?)\\s*$`,
  "i",
);
// Provider dumps put the title on its own line and the slot underneath:
// "- 23-09-2026 8:30 PM until 24-09-2026 12:00 AM - PEACOCK 8 HD"
const DATE_SOURCE = String.raw`\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}`;
const DATE_TIME_SPAN_RE = new RegExp(
  `^\\s*(${DATE_SOURCE})\\s+(${TIME_WITH_ZONE_SOURCE})\\s+(?:until|till|to|[-–—])\\s+(?:${DATE_SOURCE}\\s+)?(?:${TIME_WITH_ZONE_SOURCE})\\s*(?:[-–—|·•]\\s*(.+?))?\\s*$`,
  "i",
);
const INLINE_DATE_TIME_SPAN_RE = new RegExp(
  `^\\s*(.+?)\\s+[-–—]\\s+((${DATE_SOURCE})\\s+(${TIME_WITH_ZONE_SOURCE})\\s+(?:until|till|to|[-–—])\\s+(?:${DATE_SOURCE}\\s+)?(?:${TIME_WITH_ZONE_SOURCE})\\s*(?:[-–—|·•]\\s*(.+?))?)\\s*$`,
  "i",
);
const DATE_ONLY_RE = new RegExp(
  `^\\s*(?:(?:${ZONE})\\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\b[\\s,]+)?(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.](?:\\d{2}|\\d{4})|\\d{1,2}(?:st|nd|rd|th)?\\s+[a-z]+(?:\\s+(?:\\d{2}|\\d{4}))?|[a-z]+\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+(?:\\d{2}|\\d{4}))?)(?:\\s+(?:${ZONE}))?\\s*$`,
  "i",
);

// Cymru TV writes each fixture on one channel-first row:
// "Cymru Football 1 - Barry Town United - Connah’s Quay Nomads [26th Sep - 2:25pm BST]".
// The first dash separates the channel, the second separates the two teams,
// and the bracket owns both the event date and kick-off.
const CYMRU_CHANNEL_FIXTURE_RE = new RegExp(
  String.raw`^\s*(Cymru\s+Football\s+\d{1,3})\s+[-–—]\s+(.+?)\s+[-–—]\s+(.+?)\s+\[\s*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{2,4})?)\s+[-–—]\s+(${TIME_WITH_ZONE_SOURCE})\s*\]\s*$`,
  "i",
);

function cleanLine(line: string): string {
  return line
    .replace(/\r/g, "")
    // Keep "#11 TCU" rankings; strip only markdown markers.
    .replace(/#(?=\d)/g, "\u0000")
    .replace(/[*_`#>]+/g, "")
    .replace(/\u0000/g, "#")
    .replace(/^[\s•·●○▪▫■□★☆✅☑️-]+/u, "")
    .replace(/\s+/g, " ")
    // Some posts end the date line with a full stop ("Sunday 20-09-26.").
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function normalizeSportsListingText(value: string): string {
  return value
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

const decodeListingEntities = normalizeSportsListingText;

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

/** "Triller TV | Event 1: Highland Boxing: Resurgence 2026 10:00". */
const TRILLER_TV_EVENT_RE = new RegExp(
  String.raw`^\s*(Triller\s+TV)\s*\|\s*Event\s+(\d{1,3})\s*:\s*(.+?)\s+(${TIME_WITH_ZONE_SOURCE})\s*$`,
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

/** "GAA+ 01:  Fri 19:00 | Antrim: Naomh Seamus vs St Mary's Ahoghill". */
const CHANNEL_NAME_COLON_TIME_RE = new RegExp(
  `^\\s*([A-Za-z][A-Za-z0-9 +&'./]{1,30}?)\\s+(\\d{1,3})\\s*:\\s+(?:(mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?\\s+)?(${TIME_WITH_ZONE_SOURCE})\\s*\\|\\s*(.+?)\\s*$`,
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
    // Discord/forwarded provider dumps can clip the final character of the
    // last channel label. A trailing DAZN "H" is the clipped "HD" suffix,
    // not a separate channel format.
    const clean = part.trim()
      .replace(/^(dazn\s*\d{1,3})\s+h$/i, "$1 HD")
      ;
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
  const text = value
    .replace(/\s+/g, " ")
    // "Morning News Now ISO 2 V 9.25.26" — a V before a date is a feed tag,
    // not "versus".
    .replace(/\s+(?:x|vs\.?|v\.?|@)\s+(?!\d{4}\b|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)/gi, " v ")
    .trim();
  // A spaced ampersand is the matchup only when no other separator exists —
  // "London City v Brighton & Hove Albion" keeps the club's own "&".
  return / v /.test(text) ? text : text.replace(/\s+&\s+/g, " v ");
}

/**
 * Read an explicit Discord post heading without guessing from an ordinary
 * all-caps fixture or channel line. This is used to stop one competition from
 * being saved into another competition's existing guide.
 */
function sportsListingLineHeading(trimmed: string): string | null {
  // "#10 Notre Dame vs. UIC" is a ranked team, never a markdown heading.
  const markdownHeading = trimmed.match(/^#{1,6}(?!\d)\s*(.+?)\s*$/)?.[1];
  const boldHeading = trimmed.match(/^\*\*#{1,6}(?!\d)\s*(.+?)\*\*$/)?.[1];
  const heading = cleanLine(markdownHeading ?? boldHeading ?? "");
  if (
    heading &&
    !isDateLine(heading) &&
    !parseClockTime(heading) &&
    !/\s(?:&|v|vs|v\.|vs\.|x)\s/i.test(heading) &&
    !isLikelyChannelLabel(heading) &&
    // Generic post banners ("TODAYS LIVE EVENTS") are not competitions.
    !/^(?:today'?s?|tonight'?s?|this\s+week'?s?|daily|all)?\s*(?:live\s+)?(?:events?|listings?|schedule|fixtures|sports?)(?:\s+(?:today|tonight|live))?$/i.test(heading.replace(/[’']/g, "'"))
  ) return heading;
  return null;
}

function sportsListingHeadings(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const headings: string[] = [];
  for (const rawLine of decodeListingEntities(raw).split("\n")) {
    const heading = sportsListingLineHeading(rawLine.trim());
    if (heading) headings.push(heading);
  }
  return unique(headings);
}

/**
 * Split a post into its heading sections, keeping the lines that precede the
 * first heading as a heading-less section. Each section's events are labelled
 * with their own heading, so a "SERIE A" block never inherits a "PREMIER
 * LEAGUE" label from earlier in the post.
 */
function splitSportsListingSections(raw: string): { heading: string | null; text: string }[] {
  const sections: { heading: string | null; lines: string[] }[] = [];
  for (const rawLine of decodeListingEntities(raw).split("\n")) {
    const heading = sportsListingLineHeading(rawLine.trim());
    if (heading) {
      const last = sections[sections.length - 1];
      if (last && last.heading === heading) continue;
      sections.push({ heading, lines: [] });
      continue;
    }
    if (!sections.length) sections.push({ heading: null, lines: [] });
    sections[sections.length - 1]!.lines.push(rawLine);
  }
  return sections
    .map((s) => ({ heading: s.heading, text: s.lines.join("\n") }))
    .filter((s) => s.text.trim() || s.heading);
}

export function sportsListingHeading(raw: string | null | undefined): string | null {
  return sportsListingHeadings(raw)[0] ?? null;
}

function normalizedGuideIdentity(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:channels?|streams?|listings?|fixtures?|schedule)\b/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Only explicit, specific headings are enforced. Broad headings such as
 * "Football" can legitimately be filed into a narrower guide.
 */
export function listingHeadingMatchesGuide(raw: string | null | undefined, guideTitle: string | null | undefined): boolean {
  return mismatchedSportsListingHeading(raw, guideTitle) === null;
}

export function mismatchedSportsListingHeading(raw: string | null | undefined, guideTitle: string | null | undefined): string | null {
  const target = normalizedGuideIdentity(guideTitle ?? "");
  if (!target) return null;
  for (const heading of sportsListingHeadings(raw)) {
    const source = normalizedGuideIdentity(heading);
    if (!source || source.split(" ").length < 2) continue;
    if (/^(?:todays? live events?|live sports?|football|sport|sports)$/.test(source)) continue;
    if (source !== target && !source.includes(target) && !target.includes(source)) return heading;
  }
  return null;
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
  if (/^dazn\s*\d{1,3}(?:\s+(?:hd|uhd))?$/i.test(text)) return true;
  if (/\b(?:sky|tnt|bt|espn|dazn|cbs|fox|nbc|abc|itv|bbc|bein|viaplay|premier\s+sports|eurosport|fubo|peacock|paramount|amazon|apple|arena|supersport|sportsnet|tsn|optus|stan|setanta|flow|flo|racing\s*tv|triller(?:\s*tv)?|channel|sports?|hd|uhd|feed)\b/i.test(text)) return true;
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
  // "Fri, 9/25 - ESPN FC" is a show name (date + programme), never a channel.
  const dateOnlyLeft = dash?.[1] && /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/i.test(dash[1].trim());
  if (dash && dash[1] && dash[2] && !dateOnlyLeft && isLikelyChannelLabel(dash[2])) {
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
  // Channel-first rows with qualifiers after the fixture:
  // "HBO Max UK 1 | Page - Selby Shenzhen Open | Round 3" → channel first,
  // every later segment belongs to the event name.
  if (parts.length >= 3 && isLikelyChannelLabel(parts[0]!) && !parts.slice(1).some((p) => isLikelyChannelLabel(p))) {
    return {
      date: eventDate,
      time: normalizeTime(`${time} ${zone}`),
      title: parts.slice(1).join(": "),
      channels: [parts[0]!],
    };
  }
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
  // Provider stamps are already UK wall-clock times (Setanta "19:10" is the
  // 19:15 BST tip-off). Never shift them by the BST hour.
  const eventDate = formatListingDate(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
  const ukPart = (type: string) => (type === "hour" ? Number(hh) : type === "minute" ? Number(mm) : 0);
  const ukZone = "UK";

  const namedProvider = head.match(NAMED_PROVIDER_STAMP_HEAD_RE);
  if (namedProvider?.[1] && namedProvider[2] && namedProvider[3]) {
    return {
      date: eventDate || date,
      time: `${String(ukPart("hour") % 24).padStart(2, "0")}:${String(ukPart("minute")).padStart(2, "0")} ${ukZone}`,
      title: namedProvider[3].trim(),
      channels: [`${namedProvider[1].trim()} ${namedProvider[2]}`],
    };
  }

  // "Stan event: EventS1 name: Harlequins v Bath - PREM Rugby" → channel
  // "Stan Event S1", event after "name:".
  const stanEvent = head.match(/^([a-z][a-z0-9 +&'./-]*?)\s+event\s*:\s*event\s*([a-z]?\d{1,3})\s+name\s*:\s*(.+)$/i);
  if (stanEvent?.[1] && stanEvent[2] && stanEvent[3]) {
    const brand = stanEvent[1].trim().replace(/^\w+$/, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return {
      date: eventDate || date,
      time: `${String(ukPart("hour") % 24).padStart(2, "0")}:${String(ukPart("minute")).padStart(2, "0")} ${ukZone}`,
      title: normalizeSportsEventTitle(stanEvent[3].trim()),
      channels: [`${brand} Event ${stanEvent[2].toUpperCase()}`],
    };
  }

  // "MLB event 1 name: Mets x Nationals" → channel "MLB 1", event after "name:".
  const brandEvent = head.match(/^([a-z][a-z0-9 +&'./-]*?)\s+event\s*:?\s*(\d{1,3})\s+name\s*:\s*(.+)$/i);
  if (brandEvent?.[1] && brandEvent[2] && brandEvent[3]) {
    return {
      date: eventDate || date,
      time: `${String(ukPart("hour") % 24).padStart(2, "0")}:${String(ukPart("minute")).padStart(2, "0")} ${ukZone}`,
      title: normalizeSportsEventTitle(brandEvent[3].trim()),
      channels: [`${brandEvent[1].trim().toUpperCase()} ${brandEvent[2]}`],
    };
  }

  // "Setanta: 1: Panathinaikos - Paris" → channel "Setanta 1".
  const colonNumbered = head.match(/^([a-z][a-z0-9 +&'./-]*?)\s*:\s*(\d{1,3})\s*:\s*(.+)$/i);
  if (colonNumbered?.[1] && colonNumbered[2] && colonNumbered[3]) {
    return {
      date: eventDate || date,
      time: `${String(ukPart("hour") % 24).padStart(2, "0")}:${String(ukPart("minute")).padStart(2, "0")} ${ukZone}`,
      title: normalizeSportsEventTitle(colonNumbered[3].trim().replace(/\s+-\s+/, " v ")),
      channels: [`${colonNumbered[1].trim()} ${colonNumbered[2]}`],
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
  const cymru = line.match(CYMRU_CHANNEL_FIXTURE_RE);
  if (cymru?.[1] && cymru[2] && cymru[3] && cymru[4] && cymru[5]) {
    const parsedDate = parseListingDate(cymru[4]);
    return {
      date: parsedDate
        ? formatListingDate(new Date(Date.UTC(parsedDate.y, parsedDate.m, parsedDate.d)))
        : date,
      time: normalizeTime(cymru[5]),
      title: normalizeSportsEventTitle(`${cymru[2]} v ${cymru[3]}`),
      channels: [cymru[1].replace(/\s+/g, " ").trim()],
    };
  }

  // "MLB 1 - Mets vs. Nationals [26th Sep - 5:35pm BST]" — channel, dash,
  // fixture, then a bracket carrying the date and the UK kick-off time.
  const dashDateBracket = line.match(
    /^([A-Za-z][A-Za-z0-9+&.' ]{0,40}?\s\d{1,3})\s+[-–—]\s+(.+?)\s*[[(]\s*([^\])]+?)\s*[\])]\s*$/i,
  );
  if (dashDateBracket?.[1] && dashDateBracket[2] && dashDateBracket[3] && /\bvs?\.?\s|\s[x@]\s/i.test(dashDateBracket[2] + " ")) {
    const inner = dashDateBracket[3];
    const innerParts = inner.split(/\s*[-–—]\s*/);
    const timePart = innerParts.length > 1 ? innerParts[innerParts.length - 1] : inner;
    const datePart = innerParts.length > 1 ? innerParts.slice(0, -1).join(" ") : "";
    const timeMatch = timePart?.match(/(\d{1,2}(?:[:.]\d{2})?\s*[ap]\.?m\.?|\d{1,2}[:.]\d{2})/i);
    const parsedDate = datePart ? parseListingDate(datePart) : null;
    if (timeMatch?.[1] && (parsedDate || !datePart)) {
      return {
        date: parsedDate
          ? formatListingDate(new Date(Date.UTC(parsedDate.y, parsedDate.m, parsedDate.d)))
          : date,
        // Keep a written UK zone label ("BST"/"GMT"/"UK") so the guide shows
        // the same labelled clock as the rest of the listings.
        time:
          normalizeTime(timeMatch[1].replace(".", ":").replace(/\s+/g, "")) +
          (UK_LABELLED_TIME_RE.test(timePart ?? "") ? " BST" : ""),

        title: normalizeSportsEventTitle(dashDateBracket[2].trim()),
        channels: [dashDateBracket[1].trim().replace(/\s+/g, " ")],
      };
    }
  }

  // "National League 1 - Aldershot vs. Tamworth (3:00 PM)" — channel, dash,

  // fixture, bracketed UK kick-off.
  const dashBracket = line.match(
    /^([A-Za-z][A-Za-z0-9+&.' ]{0,40}?\s\d{1,3})\s+[-–—]\s+(.+?)\s*\(\s*(\d{1,2}(?:[:.]\d{2})?\s*[ap]\.?m\.?|\d{1,2}[:.]\d{2})\s*\)\s*$/i,
  );
  if (dashBracket && /\bvs?\.?\s|\s[x@]\s/i.test(dashBracket[2] + " ")) {
    return {
      date,
      time: normalizeTime(dashBracket[3].replace(".", ":").replace(/\s+/g, "")),
      title: normalizeSportsEventTitle(dashBracket[2].trim()),
      channels: [dashBracket[1].trim().replace(/\s+/g, " ")],
    };
  }

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

  const channelColonTrailingTimeWithNote = line.match(CHANNEL_COLON_TITLE_TIME_NOTE_RE);
  if (
    channelColonTrailingTimeWithNote?.[1] &&
    channelColonTrailingTimeWithNote[2] &&
    channelColonTrailingTimeWithNote[3] &&
    channelColonTrailingTimeWithNote[4] &&
    isLikelyChannelLabel(channelColonTrailingTimeWithNote[1])
  ) {
    return {
      date,
      time: normalizeTime(channelColonTrailingTimeWithNote[3]),
      title: normalizeSportsEventTitle(`${channelColonTrailingTimeWithNote[2]} ${channelColonTrailingTimeWithNote[4]}`),
      channels: [channelColonTrailingTimeWithNote[1].trim().replace(/\s+/g, " ")],
    };
  }

  const channelColonTrailingTime = line.match(CHANNEL_COLON_TITLE_TIME_RE);
  if (
    channelColonTrailingTime?.[1] &&
    channelColonTrailingTime[2] &&
    channelColonTrailingTime[3] &&
    isLikelyChannelLabel(channelColonTrailingTime[1])
  ) {
    return {
      date,
      time: normalizeTime(channelColonTrailingTime[3]),
      title: normalizeSportsEventTitle(channelColonTrailingTime[2]),
      channels: [channelColonTrailingTime[1].replace(/^(NFL)(\d+)$/i, "$1 $2")],
    };
  }

  const channelColonLeadingTime = line.match(CHANNEL_COLON_TIME_TITLE_RE);
  if (
    channelColonLeadingTime?.[1] &&
    channelColonLeadingTime[2] &&
    channelColonLeadingTime[3] &&
    isLikelyChannelLabel(channelColonLeadingTime[1])
  ) {
    return {
      date,
      time: normalizeTime(channelColonLeadingTime[2]),
      title: normalizeSportsEventTitle(channelColonLeadingTime[3]),
      channels: [channelColonLeadingTime[1].trim().replace(/\s+/g, " ")],
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

  // "GAA+ 01:  Fri 19:00 | Antrim: Naomh Seamus vs St Mary's Ahoghill"
  const namedColon = line.match(CHANNEL_NAME_COLON_TIME_RE);
  if (namedColon?.[1] && namedColon[2] && namedColon[4] && namedColon[5]) {
    const split = splitTitleAndInlineChannels(namedColon[5]);
    const weekday = namedColon[3] ? pickPrimaryTimePart(`${namedColon[3]} ${namedColon[4]}`).weekday : undefined;
    return {
      date: weekday ? resolveWeekdayDate(date, weekday) : date,
      time: normalizeTime(namedColon[4]),
      title: split.title,
      channels: unique([`${namedColon[1].trim()} ${namedColon[2]}`, ...split.channels]),
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

  const trillerEvent = line.match(TRILLER_TV_EVENT_RE);
  if (trillerEvent?.[1] && trillerEvent[2] && trillerEvent[3] && trillerEvent[4]) {
    return {
      date,
      time: normalizeTime(trillerEvent[4]),
      title: normalizeSportsEventTitle(trillerEvent[3]),
      channels: [`${trillerEvent[1].replace(/\s+/g, " ")} ${trillerEvent[2]}`],
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
  if (/\s(?:&|v|vs|v\.|x)\s/i.test(text)) return false;
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

const SMALL_LETTERS: Record<string, string> = {
  "ᴬ": "A", "ᴮ": "B", "ᶜ": "C", "ᴰ": "D", "ᴱ": "E", "ᶠ": "F", "ᴳ": "G", "ᴴ": "H", "ᴵ": "I", "ᴶ": "J", "ᴷ": "K", "ᴸ": "L", "ᴹ": "M",
  "ᴺ": "N", "ᴼ": "O", "ᴾ": "P", "ᴿ": "R", "ˢ": "S", "ᵀ": "T", "ᵁ": "U", "ⱽ": "V", "ᵂ": "W", "ˣ": "X", "ʸ": "Y", "ᶻ": "Z",
};
/** "ˢ ᴾ ᶠ ᴸ Cup 01" → "SPFL Cup 01". */
function normalizeSmallLetters(line: string): string {
  if (!/[ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿˢᵀᵁⱽᵂˣʸᶻ]/.test(line)) return line;
  return line
    .replace(/[ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿˢᵀᵁⱽᵂˣʸᶻ](?:\s*[ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿˢᵀᵁⱽᵂˣʸᶻ])*/g, (m) => m.replace(/\s+/g, "").split("").map((c) => SMALL_LETTERS[c] ?? c).join(""));
}

/**
 * UFC Streams: "**UFC Fight Night: A vs. B**" / "`10pm | 11pm | 1am UK`" then
 * one or more channel lines ("UFC 01", "UFC 02", "UFC 03"). Every listed
 * time carries the complete channel list; channels are not paired by position.
 */
function expandMultiSlotChannelPost(raw: string): string {
  const lines = raw.split("\n").map((l) => l.replace(/[*`#]/g, "").trim()).filter(Boolean);
  if (lines.length < 3) return raw;
  const slotRe = new RegExp(String.raw`^((?:${TIME_SOURCE})(?:\s*\|\s*(?:${TIME_SOURCE}))+)\s*UK$`, "i");
  const slotIdx = lines.findIndex((l) => slotRe.test(l));
  if (slotIdx !== 1) return raw;
  const times = lines[1].replace(/\s*UK$/i, "").split("|").map((t) => t.trim());
  const channels = lines.slice(2);
  if (!channels.length || !channels.every((c) => /^[A-Za-z][A-Za-z+ ]*\s\d{1,3}(?:\s*HD)?$/.test(c))) return raw;
  const title = lines[0];
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const london = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  let pastMidnight = false;
  let prevPm = false;
  const rows = times.map((t, i) => {
    const am = /am$/i.test(t);
    if (am && (prevPm || pastMidnight)) pastMidnight = true;
    if (/pm$/i.test(t)) prevPm = true;
    const tt = t.replace(/^(\d{1,2})\s*(am|pm)$/i, "$1:00$2");
    const slot = pastMidnight ? `${tt} UK ${days[(london.getDay() + 1) % 7]}` : `${tt} UK`;
    return `${slot}\n${title}\n${channels.join("\n")}`;
  });
  return rows.join("\n\n");
}

/** Convert repeated bold title → time → channels blocks into the parser's
 * canonical time → title → channels order before markdown is discarded. */
export function reorderMarkedTitleTimeBlocks(raw: string): string {
  const lines = decodeListingEntities(raw).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const markedTitle = lines[i]?.trim().match(/^(?:\*{2}|__)(?!#)(.+?)(?:\*{2}|__)$/)?.[1];
    if (!markedTitle) continue;
    let next = i + 1;
    while (next < lines.length && !lines[next]?.trim()) next++;
    const slot = detectEvent(cleanLine(lines[next] ?? ""), null);
    if (!slot || markedTitle.includes("|")) continue;
    // "**OTHER MOTORSPORT: SUNDAY 4 OCTOBER**" is a dated post heading, not
    // an event title — moving it below the first time would swallow the
    // first event's real title and drop that event.
    if (listingDateFromLine(cleanLine(markedTitle))) continue;
    const timeLine = lines[next]!;
    lines[i] = timeLine;
    lines[next] = markedTitle;
  }
  return lines.join("\n");
}

/** Bullet listings (cycling etc.):
 *   "1:00pm UK Ireland: Virgin One" / "CYCLING (MEN): X • UK: TNT Sports 1 (until 2pm UK) • 8"
 *   "12:10pm UK CYCLING (MEN): X" / "UK: TNT Sports 3 (4pm UK) • 9"
 * Drops bare trailing "• N" counters and time notes in brackets on channel
 * lines, and moves a "Country: Channel" found on the time line below the title. */
/** Channel handover inside one slot:
 *   "11:15am UK / 6:15am ET" / "CYCLING (MEN): X"
 *   "UK: TNT Sports 1 (until 2:30pm UK)" / "UK: TNT Sports 3 (3:30pm UK)"
 * The first slot keeps its end time in the title ("X (until 14:30)") with the
 * channels that end then; a new slot starts at the later time with the channel
 * it moves to. */
function splitChannelHandoverSlots(raw: string): string {
  const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:UK|BST|GMT)?`;
  const untilRe = new RegExp(String.raw`\s*\((?:until|till|to)\s*${T}\)`, "i");
  const fromRe = new RegExp(String.raw`\s*\((?:from\s*)?${T}\)`, "i");
  const timeLine = /^\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*UK\b/i;
  const hhmm = (h: string, m: string | undefined, ap: string | undefined) => {
    let hr = Number(h);
    if (ap?.toLowerCase() === "pm" && hr < 12) hr += 12;
    if (ap?.toLowerCase() === "am" && hr === 12) hr = 0;
    return `${String(hr).padStart(2, "0")}:${m ?? "00"}`;
  };
  const toUk = (h: string, m: string | undefined, ap: string | undefined) => `${h}:${m ?? "00"}${ap ?? ""} UK`;
  const blocks = raw.split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const ti = lines.findIndex((l) => l.trim());
    if (ti < 0 || !timeLine.test(lines[ti]!) || lines.length < ti + 3) return block;
    const title = lines[ti + 1]!.trim();
    const chans = lines.slice(ti + 2).filter((l) => l.trim());
    const until = chans.map((c) => c.match(untilRe));
    const from = chans.map((c, i) => (until[i] ? null : c.match(fromRe)));
    const ui = until.findIndex(Boolean);
    const fi = from.findIndex(Boolean);
    if (ui < 0 || fi < 0) return block;
    const u = until[ui]!, f = from[fi]!;
    const first = [lines[ti]!, `${title} (until ${hhmm(u[1]!, u[2], u[3])})`,
      ...chans.filter((_, i) => !from[i]).map((c) => c.replace(untilRe, "").trim())];
    const second = [toUk(f[1]!, f[2], f[3]), title,
      ...chans.filter((_, i) => from[i]).map((c) => c.replace(fromRe, "").trim())];
    return [...lines.slice(0, ti), ...first, "", ...second].join("\n");
  }).join("\n\n");
}

function normalizeBulletChannelListing(raw: string): string {
  raw = splitChannelHandoverSlots(raw);
  const COUNTRY = String.raw`(?:UK|Ireland|IRE|USA|US|Canada|Australia|AUS|NZ|New Zealand|South Africa|Germany|France|Spain|Italy|Worldwide|International)`;
  const countryCh = new RegExp(`^${COUNTRY}\\s*:\\s*\\S`, "i");
  const timeLead = new RegExp(String.raw`^(\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s+UK)\s+(.+)$`, "i");
  const cleanCh = (s: string) =>
    s.replace(/\s*\((?:until|from|till|to)?\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*(?:UK|ET|BST|GMT)?\)/gi, "").trim();
  const lines = raw.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    if (!/•/.test(line) && !timeLead.test(line)) {
      // "UK: TNT Sports 1 (until 2:30pm UK)" / "UK: TNT Sports 3 (3:30pm UK)":
      // time notes on channel lines are dropped so the bracketed time is
      // never read as a new slot (which lost the second channel's note).
      out.push(countryCh.test(line.trim()) ? cleanCh(line) : line);
      continue;
    }
    line = line.replace(/(?:\s*•\s*\d{1,3})+\s*$/, "");
    const tm = line.match(timeLead);
    if (tm && countryCh.test(tm[2]!.trim())) {
      const next = (lines[i + 1] ?? "").replace(/(?:\s*•\s*\d{1,3})+\s*$/, "");
      const parts = next.split(/\s*•\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length && !countryCh.test(parts[0]!)) {
        out.push(`${tm[1]} ${parts[0]}`, cleanCh(tm[2]!), ...parts.slice(1).map(cleanCh));
        i++;
        continue;
      }
    }
    if (/•/.test(line) && !tm) {
      const parts = line.split(/\s*•\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1 && parts.slice(1).every((p) => countryCh.test(p))) {
        out.push(parts[0]!, ...parts.slice(1).map(cleanCh));
        continue;
      }
    }
    out.push(countryCh.test(line.trim()) ? cleanCh(line) : line);
  }
  return out.join("\n");
}

/** Rugby Pass channel blocks:
 *   "Rugby Pass 02:" / "Bordeaux Begles v Lyon 13:30 Sharks v Leinster 17:30"
 *   "Rugby Pass 01: Lions v Ospreys 12:45" / "Rpass06: Castres v Toulouse 20:00"
 * Rewrites every fixture as "Channel | Event HH:MM" (one per row), splitting
 * rows carrying several "Event HH:MM" fixtures. */
function normalizeChannelHeaderFixtureBlocks(raw: string): string {
  const header = /^\s*(Rugby\s*Pass|Rpass)\s*0?(\d{1,2})\s*:\s*(.*)$/i;
  if (!raw.split("\n").some((l) => header.test(l))) return raw;
  const fixtureRe = /(.+?)\s+(\d{1,2}[:.]\d{2})(?=\s|$)/g;
  const out: string[] = [];
  let channel: string | null = null;
  const emit = (text: string): boolean => {
    const t = text.trim();
    if (!t || !channel) return false;
    const found = [...t.matchAll(fixtureRe)];
    if (!found.length || found.map((m) => m[0]).join(" ").replace(/\s+/g, " ") !== t.replace(/\s+/g, " ")) return false;
    for (const m of found) out.push(`${channel} | ${m[1]!.trim()} ${m[2]}`);
    return true;
  };
  for (const line of raw.split("\n")) {
    const h = line.match(header);
    if (h) {
      channel = `Rugby Pass ${h[2]!.padStart(2, "0")}`;
      if (h[3]!.trim() && !emit(h[3]!)) out.push(line);
      continue;
    }
    if (!line.trim()) { out.push(line); continue; }
    if (!emit(line)) { channel = null; out.push(line); }
  }
  return out.join("\n");
}

export function parseSportsListingBlock(raw: string | null | undefined): SportsListingEvent[] {
  if (!raw) return [];
  raw = reorderMarkedTitleTimeBlocks(expandMultiSlotChannelPost(normalizeBulletChannelListing(normalizeChannelHeaderFixtureBlocks(raw))));
  const explicitHeadings = new Set(sportsListingHeadings(raw).map((heading) => heading.toLowerCase()));
  // Rugby Pass style: "Channel NN | Event HH:MM" rows, optionally with bare
  // "Event HH:MM" continuation rows that belong to the channel above them.
  const hasChannelPipeRows = raw
    .split("\n")
    .some((l) =>
      new RegExp(String.raw`^[A-Za-z][A-Za-z+&' ]*?\s\d{1,3}(?:\s*HD)?\s*\|\s*.+?\s+(?:${TIME_SOURCE})\s*$`, "i").test(
        l.replace(/[*`#]/g, "").trim(),
      ),
    );
  const lines = decodeListingEntities(raw)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    // "Rugby Pass 01 | Ultimate Sevens Rugby - London Grand Final 17:30"
    // (channel | event trailing-time) → time / event / channel rows.
    .flatMap((line) => {
      // "Coupang 1 | Race // UK Sat 26 Sep 11:15am // ET ..." rows carry
      // their own zoned slots — never split them as Rugby Pass rows.
      if (line.includes("//")) return [line];
      const m = line.match(
        new RegExp(String.raw`^([A-Za-z][A-Za-z+&' ]*?\s\d{1,3}(?:\s*HD)?)\s*\|\s*(.+?)\s+(${TIME_SOURCE})\s*$`, "i"),
      );
      if (m) return [m[3], m[2].trim(), m[1].trim()];
      // Scottish Cup Streams: "ˢ ᴾ ᶠ ᴸ Cup 01 | 20:00 Queen of the South vs Rangers II"
      // (channel | leading time + event). Break the channel onto its own
      // line; small-letter channel tags become plain "SPFL Cup 01".
      const plain = normalizeSmallLetters(line);
      const s = plain.match(
        new RegExp(String.raw`^([A-Za-z][A-Za-z+&' ]*?\s\d{1,3}(?:\s*HD)?)\s*\|\s*(${TIME_SOURCE})\s+(.+?)\s*$`, "i"),
      );
      if (s) return [s[2], s[3].trim(), s[1].trim()];
      // UK Women's Football (FA Player): "WF00: 13:30 Charlton vs Man City"
      // (channel code + colon, leading time, event). Pipe rows such as
      // "NFL 02: 1pm ET | 6pm UK" are handled later — never split them here.
      if (line.includes("|")) return [line];
      const wf = line.match(
        new RegExp(String.raw`^([A-Za-z]{1,6}\s?\d{1,3})\s*:\s*(${TIME_SOURCE})\s+(.+?)\s*$`, "i"),
      );
      return wf ? [wf[2], wf[3].trim(), wf[1].trim().toUpperCase()] : [line];
    })
    // "VIP | Rugby Pass" headers are post headings, not events.
    .filter((line) => !/^vip\s*\|/i.test(line))
    // "UK | Premier Sports 1" / "IRE | Premier Sports 1" — region tag before a
    // numbered channel. Keep the region (UK and IRE feeds differ); normalise
    // to "IRE Premier Sports 1" so it reads as one channel name.
    .map((line) => {
      const m = line.match(/^(UK|IRE|IE|ROI|US|USA|CA|CAN|AUS|NZ)\s*\|\s*(.+?\s\d{1,3}(?:\s*HD)?)$/i);
      return m ? `${m[1].toUpperCase()} ${m[2].trim()}` : line;
    })
    .filter((line, i, arr) => !(i > 0 && line === arr[i - 1] && /\s\d{1,3}(?:\s*HD)?$/i.test(line)));
  // WST and other listings commonly repeat this three-line layout:
  // title → "UK time | ET time" → channel(s). Resolve that structure before
  // the stateful parser runs, otherwise a repeated title can be provisionally
  // attached to the previous event as a channel and reverse the pairing.
  for (let i = 0; i < lines.length - 2; i++) {
    const title = lines[i];
    const slot = lines[i + 1];
    const channel = lines[i + 2];
    if (
      DUAL_TIME_ONLY_RE.test(slot) &&
      !detectEvent(title, null) &&
      !listingDateFromLine(title) &&
      !isNoiseLine(title) &&
      !explicitHeadings.has(title.toLowerCase()) &&
      !isLikelyChannelLabel(title) &&
      isLikelyChannelLabel(channel) &&
      // NBA time-first layout: "3:00am UK THU / 10:00pm ET WED" then
      // "WARRIORS @ TRAIL BLAZERS" — a matchup below the slot is the event
      // title, so the channel line above the slot must stay a channel.
      !/\s(?:@|vs?\.?|x)\s/i.test(channel)
    ) {
      lines.splice(i, 3, slot, title, channel);
      i += 2;
    }
  }
  // Rugby Pass continuation rows: a bare "Event HH:MM" line under a
  // "Channel NN | ..." row belongs to that same channel — attach it so each
  // fixture keeps its channel instead of swallowing the next one.
  if (hasChannelPipeRows) {
    let lastChannel: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const ch = lines[i].match(/^([A-Za-z][A-Za-z+&' ]*?\s\d{1,3}(?:\s*HD)?)$/);
      if (ch) {
        lastChannel = ch[1].trim();
        continue;
      }
      if (!lastChannel) continue;
      const m = lines[i].match(new RegExp(String.raw`^(.+?\b(?:v|vs)\b.+?)\s+(${TIME_SOURCE})$`, "i"));
      if (m) {
        lines.splice(i, 1, m[2], m[1].trim(), lastChannel);
        i += 2;
      }
    }
  }
  // NHL Center Ice: "NHL | 01 - 7pm ET | 12am UK" then the fixture on the
  // next line. The ET clock is authoritative because supplied UK clocks can
  // be wrong; conversion to UK time happens after parsing. Channel
  // becomes "NHL 01". The "US | NHL Center Ice" header is not an event.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      new RegExp(String.raw`^([A-Za-z][A-Za-z+ ]*?)\s*\|\s*(\d{1,3})\s*[-–—]\s*(?:${TIME_SOURCE})\s*ET\s*\|\s*(${TIME_SOURCE})\s*UK\s*$`, "i"),
    );
    if (m && i + 1 < lines.length) {
      // Evening ET slots land after midnight UK — tag the UK weekday so the
      // event belongs to the next day instead of being swept as stale.
      const etClock = lines[i].match(new RegExp(String.raw`[-–—]\s*(${TIME_SOURCE})\s*ET`, "i"))?.[1];
      const slot = etClock ? `${etClock} ET` : m[3];
      lines.splice(i, 2, slot, lines[i + 1], `${m[1].trim()} ${m[2]}`);
      i += 2;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^(US|USA)\s*\|\s*NHL Center Ice$/i.test(lines[i])) lines.splice(i, 1);
  }
  // NFL Sunday Ticket: "NFL 02: 1pm ET | 6pm UK" or
  // "NFL | 02 - SNF 8:20pm ET | 1:20am UK", then the fixture on the next
  // line. Use the stated UK time and ignore schedule labels such as SNF.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      new RegExp(String.raw`^(NFL)\s*(?:\|\s*)?(\d{1,3})\s*(?::|[-–—])\s*(?:(?:TNF|SNF|MNF)\s+)?(?:${TIME_SOURCE})\s*ET\s*\|\s*(${TIME_SOURCE})\s*UK\s*$`, "i"),
    );
    if (m && i + 1 < lines.length) {
      const etPm = /pm/i.test(lines[i].split("|")[0] ?? "");
      const ukAm = /^(12|[1-9])(?::\d{2})?\s*am$/i.test(m[3].trim());
      let slot = m[3];
      if (etPm && ukAm) {
        const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        const london = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
        slot = `${m[3]} UK ${days[(london.getDay() + 1) % 7]}`;
      }
      lines.splice(i, 2, slot, lines[i + 1], `${m[1].trim()} ${m[2]}`);
      i += 2;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^(US|USA)\s*\|\s*NFL Sunday Ticket$/i.test(lines[i])) lines.splice(i, 1);
  }
  // NBA League Pass (new style): "NBA 01: Nets vs Hornets 12:00am Wed" —
  // fixture and a UK clock with its weekday on one row, no ET|UK pair.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      new RegExp(String.raw`^(NBA)\s*(?:\|\s*)?(\d{1,3})\s*:\s*(.+?)\s+(${TIME_SOURCE})\s+(${WEEKDAY_HINT_SOURCE})\s*$`, "i"),
    );
    if (!m) continue;
    lines.splice(i, 1, `${m[4]} UK ${m[5]}`, m[3].trim(), `${m[1]} ${m[2].padStart(2, "0")}`);
    i += 2;
  }
  // NBA League Pass puts its fixture and both clocks on one row. Keep only
  // the stated UK time and turn the numbered NBA feed into the channel.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      new RegExp(String.raw`^(NBA)\s*(?:\|\s*)?(\d{1,3})\s*:\s*(.+?)\s+(${TIME_SOURCE})\s*ET\s*\|\s*(${TIME_SOURCE})\s*UK\s*$`, "i"),
    );
    if (!m) continue;
    const etPm = /pm/i.test(m[4]);
    const ukAm = /^(12|[1-9])(?::\d{2})?\s*am$/i.test(m[5].trim());
    let slot = m[5];
    if (etPm && ukAm) {
      const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      const london = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
      slot = `${m[5]} UK ${days[(london.getDay() + 1) % 7]}`;
    }
    lines.splice(i, 1, slot, m[3].trim(), `${m[1]} ${m[2].padStart(2, "0")}`);
    i += 2;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^(US|USA)\s*\|\s*NBA League Pass$/i.test(lines[i])) lines.splice(i, 1);
  }
  // DAZN merges can put a fixture or venue qualifier before the dated slot.
  // Split complete fixtures out; join qualifiers to the programme name above.
  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i].match(INLINE_DATE_TIME_SPAN_RE);
    if (!inline) continue;
    const prefix = inline[1].trim();
    const slot = inline[2].trim();
    const prefixIsTitle = /\s(?:@|v|vs\.?|x)\s/i.test(prefix);
    const previous = lines[i - 1];
    if (!prefixIsTitle && previous && !DATE_TIME_SPAN_RE.test(previous.replace(/^[-–—•]\s*/, "")) && !listingDateFromLine(previous) && !isLikelyChannelLabel(previous)) {
      lines.splice(i - 1, 2, `${previous} - ${prefix}`, slot);
      i -= 1;
    } else {
      lines.splice(i, 1, prefix, slot);
      i += 1;
    }
  }
  // Provider exports occasionally inject a lone marker between a programme
  // title and its dated slot (for example "Vienna - GCL Round 1", "D", then
  // the DAZN slot). Drop only that marker shape so the title remains paired
  // with the slot beneath it.
  for (let i = lines.length - 2; i >= 1; i--) {
    if (
      /^[A-Za-z]$/.test(lines[i]) &&
      !DATE_TIME_SPAN_RE.test(lines[i - 1].replace(/^[-–—•]\s*/, "")) &&
      DATE_TIME_SPAN_RE.test(lines[i + 1].replace(/^[-–—•]\s*/, ""))
    ) {
      lines.splice(i, 1);
    }
  }
  // Provider dumps: "Title" then "- DD-MM-YYYY 11:00 AM until ... - CHANNEL".
  // Reorder each pair into slot → title → channel so every programme keeps
  // its own channel.
  const reorderedSlots = new Set<string>();
  for (let i = 0; i < lines.length - 1; i++) {
    const span = lines[i + 1].replace(/^[-–—•]\s*/, "").match(DATE_TIME_SPAN_RE);
    if (!span || DATE_TIME_SPAN_RE.test(lines[i].replace(/^[-–—•]\s*/, ""))) continue;
    if (listingDateFromLine(lines[i])) continue;
    const channel = span[span.length - 1]?.trim();
    const slot = lines[i + 1].replace(/^[-–—•]\s*/, "").replace(/\s*[-–—|·•]\s*[^-–—|·•]+$/, channel ? "" : "$&");
    const rows = [slot, lines[i]];
    reorderedSlots.add(slot);
    if (channel) rows.push(channel);
    lines.splice(i, 2, ...rows);
    i += rows.length - 1;
  }

  const events: SportsListingEvent[] = [];
  let currentDate: string | null = null;
  let current: SportsListingEvent | null = null;
  // Provider dumps name the programme on the line above its time slot.
  let previousPlainLine: string | null = null;
  let titleCameFromAbove = false;
  // Reordered provider slots already carry their channel; the programme name
  // line is kept whole ("Fri, 9/25 - ESPN FC" is a show name, not a channel).
  let slotTitlePending = false;

  const flush = () => {
    if (!current) return;
    const done = finalized(current);
    if (done) events.push(done);
    current = null;
    titleCameFromAbove = false;
    slotTitlePending = false;
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
    // A new competition/provider heading ends the preceding event. Never let
    // headings such as "UEFA NATIONS LEAGUE" become channels on the event
    // above them when Discord posts are pasted or combined.
    if (explicitHeadings.has(line.toLowerCase()) && (!current || Boolean(current.title))) {
      flush();
      previousPlainLine = null;
      lastChannelWasPlain = null;
      continue;
    }

    const detected = detectEvent(line, currentDate);
    if (detected) {
      // "Azerbaijan : Practice 1" / "9:30am UK | 4:30am ET" / channels —
      // the title sits ABOVE a bare time line and channels follow below.
      // Reordered provider slots carry their own title on the next line; a
      // heading above them ("## UFC FIGHTPASS") must never become the title.
      if (reorderedSlots.has(line)) {
        flush();
        current = detected;
        slotTitlePending = true;
        previousPlainLine = null;
        lastChannelWasPlain = null;
        continue;
      }
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
      const belowIsTitle = Boolean(below) && !detectEvent(below, currentDate) && (
        MATCHUP_RE.test(below) || isLikelyChannelLabel(lines[li + 2] ?? "")
      );
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
    if (!current.title && slotTitlePending) {
      slotTitlePending = false;
      current.title = line;
      continue;
    }
    if (!current.title) {
      // Formatter-generated listings always put the complete event name on
      // the line after the clock and the channel on the following line. Do
      // not split title punctuation such as "Day 1 • Night Session" or a
      // competition suffix such as "Seoul: Day 5 - WTA 250" when that next
      // line is clearly the channel. This keeps preview and saved read-back
      // identical for Stan and other provider-stamp imports.
      const following = lines[li + 1] ?? "";
      if (following && isLikelyChannelLabel(following) && !detectEvent(following, currentDate)) {
        current.title = line;
      } else {
        const split = splitTitleAndInlineChannels(line);
        current.title = split.title;
        current.channels.push(...split.channels);
      }
      continue;
    }
    if (titleCameFromAbove) {
      // In this format the next plain line names the following programme.
      flush();
      previousPlainLine = line;
      continue;
    }
    // Tennis TV / season-pass follow-on rows with no slot:
    // "Arnaldi, Matteo vs Sakamoto, Rei - ATP Tokyo :Tennis 09". They are a
    // fixture, never extra channels for the event above, and carry no start
    // time, so they cannot become guide events — skip them.
    if (/\s(?:vs?\.?|@|x)\s/i.test(line) && /\s:\s*[A-Za-z][A-Za-z ]{0,30}\d{1,3}\s*$/.test(line)) {
      lastChannelWasPlain = null;
      continue;
    }
    const parts = splitChannelLine(line);
    current.channels.push(...parts);
    lastChannelWasPlain = parts.length === 1 ? parts[0] : null;
  }
  flush();

  // Drop exact duplicate listings (same date, time, name and channels) — a
  // post that lists an event twice should import it once.
  const seenEvents = new Set<string>();
  return events.filter((e) => {
    const key = `${e.date ?? ""}|${(e.time ?? "").toLowerCase()}|${(e.title ?? "").trim().toLowerCase()}|${(e.channels ?? []).join(",").toLowerCase()}`;
    if (seenEvents.has(key)) return false;
    seenEvents.add(key);
    return true;
  });
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

/** Give every event without its own day/date the listing/import date. */
function applyImplicitDateRollover(events: SportsListingEvent[], fallbackDate?: string | null): SportsListingEvent[] {
  const base = parseListingDate(fallbackDate);
  if (!base) return events;
  const fallback = formatListingDate(new Date(Date.UTC(base.y, base.m, base.d)));
  return events.map((event) => (event.date ? event : { ...event, date: fallback }));
}

/**
 * Daily posts run past midnight: an early-morning time (before 06:00) that
 * follows a later time in the same date group belongs to the next day.
 * Rolls are never chained — an event moves at most one day past the date the
 * post gave it, and later daytime events stay on the post's own date (posts
 * like "Todays Live Events" list channel blocks out of time order).
 */
function rollOvernightEvents(events: SportsListingEvent[]): SportsListingEvent[] {
  let groupDate: string | null = null;
  let maxMinutes: number | null = null;
  return events.map((event) => {
    const clock = parseClockTime(event.time ?? "");
    const minutes = clock ? clock.hour * 60 + clock.minute : null;
    if (event.date !== groupDate) {
      groupDate = event.date ?? null;
      maxMinutes = minutes;
      return event;
    }
    if (minutes === null) return event;
    const roll = event.date && maxMinutes !== null && minutes < 6 * 60 && maxMinutes - minutes > 6 * 60;
    if (minutes >= 6 * 60) maxMinutes = Math.max(maxMinutes ?? 0, minutes);
    if (!roll || !event.date) return event;
    const parsed = parseListingDate(event.date);
    if (!parsed) return event;
    return { ...event, date: formatListingDate(new Date(Date.UTC(parsed.y, parsed.m, parsed.d + 1))) };
  });
}

/** Times that already name a UK zone are never reinterpreted as ET. */
const UK_LABELLED_TIME_RE = /\b(uk|gmt|bst)\b/i;
const ET_LABELLED_TIME_RE = /\b(et|est|edt|eastern)\b/i;

function eventTimeForOutput(event: SportsListingEvent, input: ListingInput): string {
  if (UK_LABELLED_TIME_RE.test(event.time ?? "")) {
    return sourceTimeToUk(event.time, event.date ?? input.date ?? undefined, "gmt", input.nowMs) ?? event.time;
  }
  if (ET_LABELLED_TIME_RE.test(event.time ?? "")) {
    return sourceTimeToUk(event.time, event.date ?? input.date ?? undefined, "et", input.nowMs) ?? event.time;
  }
  if (input.sourceZone) {
    const converted = sourceTimeToUk(event.time, event.date ?? input.date ?? undefined, input.sourceZone, input.nowMs);
    if (converted) return converted;
  }
  return event.time;
}

/**
 * Date a listing post should fall under when it never writes one: the day it
 * is imported, in UK office time. A clock changing from late to early does not
 * imply tomorrow; only a day/date written on that event can move it.
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
    const etLabelled = ET_LABELLED_TIME_RE.test(event.time ?? "");
    const centerIce = /\b(?:nhl\s+)?center\s+ice\b/i.test(input.guideTitle ?? "") &&
      event.channels.some((channel) => /^NHL\s+\d+/i.test(channel));
    const zone: TimeZoneChoice | null = labelled ? "gmt" : etLabelled || centerIce ? "et" : (input.sourceZone ?? null);
    if (!zone) return event;
    const date = event.date ?? input.date ?? null;
    const parts = sourceTimeToUkParts(event.time, date ?? undefined, zone, input.nowMs);
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
  // No date written anywhere in the post: date it from the import day rather
  // than leaving the guide dateless for someone to fill in afterwards.
  const base = input.date ?? importDayListingDate(input.nowMs);
  const processSection = (text: string): SportsListingEvent[] => {
    const parsed = parseSportsListingBlock(text);
    const dated = rollOvernightEvents(applyImplicitDateRollover(parsed, base));
    return convertEventsToUk(dated, { ...input, date: base ?? input.date });
  };

  // Every explicit competition heading belongs on the events beneath it
  // ("ICC ODI: India v West Indies"). A post with several headings is split
  // into its sections so each event carries its own section's heading —
  // never the first heading of the whole post. Do not duplicate a heading
  // when the event name already begins with it.
  const sections = splitSportsListingSections(input.raw ?? "");
  const labelled = sections.flatMap((section) => {
    const events = processSection(section.text);
    if (!section.heading) return events;
    const heading = section.heading;
    return events.map((event) =>
      event.title.toLowerCase().startsWith(heading.toLowerCase())
        ? event
        : { ...event, title: `${heading}: ${event.title}` },
    );
  });
  const events = dedupeSportsListingEvents(sortSportsListingEvents(labelled));
  if (!events.length) return null;

  return formatSportsListingEvents(events, { ...input, date: base ?? input.date });
}

export function formatSportsListingEvents(events: SportsListingEvent[], input: ListingInput): string {
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
    // Parsed rows own their channels. The block-level list is only a fallback
    // for legacy single-event queue items; applying it globally corrupts a
    // merged multi-channel post even though its preview is correct.
    const channels = normalizeChannels(
      event.channels?.length ? event.channels : (input.channels ?? []).filter(Boolean),
    );
    // iFollow fixtures are found under the team's own channel rather than a
    // numbered feed. Give every fixture in that guide the same channel label.
    if (/^iFollow\b/i.test(input.guideTitle?.trim() ?? "")) {
      if (!channels.some((channel) => channel.toLowerCase() === "under team channels")) channels.push("Under Team Channels");
    }
    // Scottish Cup posts list each regional feed on its own line
    // ("Premier Sports 1 UK" / "Premier Sports 1 IRE"). Keep that channel
    // break and the source names exactly — never join them with " | ".
    const regionalFeeds = channels.length > 1 && channels.every((c) => /\s(UK|IRE)$/i.test(c));
    if (channels.length) {
      if (regionalFeeds) out.push(...channels);
      else out.push(channels.join(" | "));
    }
  }

  return out.join("\n").trim();
}

/** Rebuild an existing guide plus a new import into one sorted event list. */
export function mergeSportsListingBlocks(existing: string, incoming: string, input: Omit<ListingInput, "raw">, nowMs: number = Date.now()): string | null {
  const cutoff = GUIDE_STALE_HOURS * 60 * 60 * 1000;
  // Entries already past the 10-hour window are dropped on re-import so
  // yesterday's listings never sit above the new day's events.
  const fresh = (event: SportsListingEvent) => {
    const instant = ukListingInstant(event.date, event.time);
    return instant === null || nowMs - instant <= cutoff;
  };
  const events = dedupeSportsListingEvents(sortSportsListingEvents([
    ...parseSportsListingBlock(existing).filter(fresh),
    ...parseSportsListingBlock(incoming),
  ]));
  // Each parsed event already owns its channels. Re-applying the incoming
  // event's channels here incorrectly adds them to every older guide entry.
  return events.length ? formatSportsListingEvents(events, { ...input, channels: [] }) : null;
}

/**
 * Drops repeat entries: same date, same start time, same event name and the
 * same channel(s). Keeps the first; different channels stay separate.
 */
export function dedupeSportsListingEvents(events: SportsListingEvent[]): SportsListingEvent[] {
  const seen = new Set<string>();
  const norm = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  // Loose text match: ignore punctuation, "vs"/"v" differences and spacing.
  const loose = (v: string | null | undefined) =>
    norm(v).replace(/\b(vs\.?|versus|@)\s/g, "v ").replace(/[^\p{L}\p{N}]+/gu, "");
  const dateKey = (v: string | null | undefined) => {
    const d = v ? parseListingDate(v) : null;
    return d ? JSON.stringify(d) : loose(v);
  };
  const timeKey = (v: string | null | undefined) => {
    const c = parseClockTime(v ?? "");
    return c ? `${c.hour}:${c.minute}` : loose(v);
  };
  return events.filter((e) => {
    const key = [
      dateKey(e.date),
      timeKey(e.time),
      loose(e.title),
      (e.channels ?? []).map(loose).sort().join("|"),
    ].join("#");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Removes duplicate entries from a saved guide body. Returns the new HTML, or
 * null when nothing changes or the body isn't a plain formatter-built listing.
 */
export function dedupeSportsListingHtml(html: string | null | undefined): string | null {
  if (!html || !html.trim()) return null;
  if (/data-link-preview|<img|<iframe|<video|<table/i.test(html)) return null;
  const events = parseSportsListingBlock(html);
  if (!events.length) return null;
  const kept = dedupeSportsListingEvents(events);
  const rebuilt = plainListingToHtml(formatSportsListingEvents(sortSportsListingEvents(kept), { channels: [] }));
  const before = normalizeListingBody(html);
  const after = normalizeListingBody(rebuilt);
  if (before === after) return null;
  // Only rewrite when every original line survives or belongs to a dropped
  // repeat — never lose staff-written notes or headings.
  const keptLines = new Set(after.split("\n").map((l) => l.trim().toLowerCase()));
  const dropped = events.filter((e) => !kept.includes(e));
  const droppedText = new Set(
    dropped.flatMap((e) => [e.date ?? "", e.time ?? "", e.title, ...(e.channels ?? [])]).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  const lineOk = (line: string) => {
    const l = line.trim().toLowerCase();
    if (!l || keptLines.has(l)) return true;
    return [...droppedText].some((t) => l.includes(t));
  };
  if (!before.split("\n").every(lineOk)) return null;
  return rebuilt;
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
