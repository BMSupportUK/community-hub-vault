export type DayBand = "morning" | "afternoon" | "evening";

/** Current hour in UK office time (Europe/London). */
export function ukHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(now);
  return Number(h) % 24;
}

/** 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening. */
export function dayBand(hour: number): DayBand {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

export function greetingFor(hour: number): string {
  const b = dayBand(hour);
  return b === "morning" ? "Good morning" : b === "afternoon" ? "Good afternoon" : "Good evening";
}
