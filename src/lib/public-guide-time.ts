// Browser-safe helpers to show public guide times in UK time and the viewer's zone.
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function londonToday(): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: g("year"), m: g("month"), d: g("day") };
}

export function parseGuideDate(label: string | null): { y: number; m: number; d: number } | null {
  const today = londonToday();
  if (!label) return null;
  const num = label.match(/(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/);
  if (num) {
    const a = Number(num[1]), b = Number(num[2]);
    const [d, m] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
    let y = num[3] ? Number(num[3]) : today.y;
    if (y < 100) y += 2000;
    return { y, m, d };
  }
  const named = label.toLowerCase().match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*(?:\s+(\d{4}))?|([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
  if (named) {
    const d = Number(named[1] ?? named[5]);
    const mi = MONTHS.indexOf((named[2] ?? named[4]) as string);
    if (mi >= 0) return { y: Number(named[3] ?? named[6] ?? today.y), m: mi + 1, d };
  }
  return null;
}

function offsetMs(utcMs: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - utcMs;
}

/** UTC ms for a UK wall-clock time like "20:00" / "8:30pm" on the guide date. */
export function guideEventUtcMs(date: string | null, time: string | null): number | null {
  if (!time) return null;
  const t = time.toLowerCase().match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)/);
  if (!t) return null;
  let h = Number(t[1] ?? t[4]);
  const min = Number(t[2] ?? 0);
  const ap = t[3] ?? t[5];
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const day = parseGuideDate(date) ?? londonToday();
  const naive = Date.UTC(day.y, day.m - 1, day.d, h, min);
  let utc = naive - offsetMs(naive, "Europe/London");
  utc = naive - offsetMs(utc, "Europe/London");
  return utc;
}

export function formatZone(utcMs: number, tz: string) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(utcMs));
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(utcMs));
  const zone = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")?.value ?? "";
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(utcMs));
  return { time, date, zone, dayKey };
}
