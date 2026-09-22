// Kick-off time handling for the Sports Guide importer.
//
// Listing posts usually give ONE time in ONE zone ("19:45", "8pm ET").
// Staff tell us which zone that is and we render both, UK first:
//   "19:45 GMT · 14:45 ET"

export type TimeZoneChoice = "gmt" | "et";

const UK_TZ = "Europe/London";
const ET_TZ = "America/New_York";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Does the text already spell out both a UK and a US Eastern time? */
export function hasBothZones(time: string | null | undefined): boolean {
  if (!time) return false;
  const t = time.toLowerCase();
  const uk = /\b(gmt|bst|uk)\b/.test(t);
  const et = /\b(et|est|edt|eastern)\b/.test(t);
  return uk && et;
}

/** Pulls the first clock time out of free text. Returns 24h hour/minute. */
export function parseClockTime(time: string | null | undefined): { hour: number; minute: number } | null {
  if (!time) return null;
  const m = time.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i) ?? time.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (!m) return null;

  let hour: number;
  let minute: number;
  let ampm: string | undefined;
  if (m.length >= 4 && m[2] && /^\d{2}$/.test(m[2])) {
    hour = Number(m[1]);
    minute = Number(m[2]);
    ampm = m[3]?.toLowerCase();
  } else {
    hour = Number(m[1]);
    minute = 0;
    ampm = m[2]?.toLowerCase();
  }
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Pulls a calendar date out of free text like "Saturday 3 October 2026". */
export function parseListingDate(date: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!date) return null;
  const t = date.toLowerCase();

  // "3 October 2026" / "3rd Oct 2026"
  let m = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?\s*(\d{4})?/);
  if (m) {
    const monthIdx = MONTHS.findIndex((name) => name.startsWith(m![2].slice(0, 3)));
    if (monthIdx >= 0) {
      return { y: m[3] ? Number(m[3]) : new Date().getFullYear(), m: monthIdx, d: Number(m[1]) };
    }
  }
  // "October 3 2026"
  m = t.match(/([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/);
  if (m) {
    const monthIdx = MONTHS.findIndex((name) => name.startsWith(m![1].slice(0, 3)));
    if (monthIdx >= 0) {
      return { y: m[3] ? Number(m[3]) : new Date().getFullYear(), m: monthIdx, d: Number(m[2]) };
    }
  }
  // "03/10/2026", "03-10-2026", "03.10.2026" (UK order)
  m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const year = Number(m[3]);
    return { y: year < 100 ? 2000 + year : year, m: Number(m[2]) - 1, d: Number(m[1]) };
  }
  return null;
}

/** Offset (ms) of a timezone at a given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - instant;
}

/** Turns a wall-clock time in a zone into a real instant. */
function wallTimeToInstant(
  d: { y: number; m: number; d: number },
  t: { hour: number; minute: number },
  timeZone: string,
): number {
  const guess = Date.UTC(d.y, d.m, d.d, t.hour, t.minute);
  let instant = guess - zoneOffsetMs(guess, timeZone);
  // One correction pass handles days where the offset changes.
  instant = guess - zoneOffsetMs(instant, timeZone);
  return instant;
}

function formatInZone(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(instant));
}

/** Is the UK on summer time at that instant? (labels the time BST vs GMT) */
function ukLabel(instant: number): string {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TZ, timeZoneName: "short" })
    .formatToParts(new Date(instant))
    .find((p) => p.type === "timeZoneName")?.value;
  return name === "BST" ? "BST" : "GMT";
}

function etLabel(instant: number): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: ET_TZ, timeZoneName: "short" })
    .formatToParts(new Date(instant))
    .find((p) => p.type === "timeZoneName")?.value;
  return name === "EDT" ? "EDT" : "EST";
}

/** First clock time found anywhere in a block of text ("19:45", "8pm"). */
export function firstClockIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\d{1,2}[:.]\d{2}\s*(?:am|pm)?/i) ?? text.match(/\b\d{1,2}\s*(?:am|pm)\b/i);
  return m ? m[0] : null;
}

/** First calendar date found anywhere in a block of text. */
export function firstDateIn(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const line of text.split("\n")) {
    if (parseListingDate(line)) return line.trim();
  }
  return null;
}

/**
 * Builds a "19:45 GMT · 14:45 EDT" style label from a single listed time,
 * given which zone that listed time belongs to. Returns null when the time
 * can't be read, so callers can keep the original text.
 */
export function buildDualTime(
  time: string | null | undefined,
  date: string | null | undefined,
  source: TimeZoneChoice,
): string | null {
  const clock = parseClockTime(time);
  if (!clock) return null;
  const day = parseListingDate(date) ?? (() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  })();

  const instant = wallTimeToInstant(day, clock, source === "gmt" ? UK_TZ : ET_TZ);

  // When the conversion crosses midnight, spell out the day so nobody
  // reads an 8pm US card as an 8pm UK one.
  const dayNote = (timeZone: string) => {
    const shown = dayNumberInZone(instant, timeZone);
    const listed = day.d;
    if (shown === listed) return "";
    const nextDay = new Date(Date.UTC(day.y, day.m, day.d + 1)).getUTCDate();
    return shown === nextDay ? " (next day)" : " (previous day)";
  };

  const uk = `${formatInZone(instant, UK_TZ)} ${ukLabel(instant)}${dayNote(UK_TZ)}`;
  const et = `${formatInZone(instant, ET_TZ)} ${etLabel(instant)}${dayNote(ET_TZ)}`;
  return `${uk} · ${et}`;
}

function dayNumberInZone(instant: number, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric" }).format(new Date(instant)),
  );
}
