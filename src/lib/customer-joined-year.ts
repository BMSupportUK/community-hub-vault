export function ukCurrentYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric" }).format(now));
}

export function customerJoinedYear(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : ukCurrentYear(date);
}

export function customerYearsFromYear(year: number | null, now = new Date()): number | null {
  return year === null ? null : Math.max(0, ukCurrentYear(now) - year);
}

export function joinedYearToDate(value: string, now = new Date()): string | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 1000 && year <= ukCurrentYear(now) ? `${value}-01-01` : null;
}