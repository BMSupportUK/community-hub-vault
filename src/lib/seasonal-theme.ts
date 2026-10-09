export type Season = "halloween" | "christmas" | "bonfire" | "easter";

/** Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm). */
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  return { month: Math.floor(value / 31), day: (value % 31) + 1 };
}

/** Seasonal windows follow the UK calendar, including daylight saving. */
export function getSeason(date: Date = new Date()): Season | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const month = part("month");
  const day = part("day");
  if (month === 10) return "halloween";
  if (month === 12) return "christmas";
  if (month === 11 && day === 5) return "bonfire";
  const easter = easterSunday(part("year"));
  if (month === easter.month && day === easter.day) return "easter";
  return null;
}
