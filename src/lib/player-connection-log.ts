/** Connection log keeps 30 days; the filter never reaches past that or into the future. */
export const LOG_DAYS = 30;

export function watchedConnections<T extends { preview: boolean | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.preview !== true);
}

export function logRange({ year, month, day, now }: { year: number; month: number | "all"; day?: Date; now: number }) {
  const floor = new Date(now - LOG_DAYS * 86400000);
  const ceil = new Date(now + 60000);
  let from: Date, to: Date;
  if (day) { from = new Date(day.getFullYear(), day.getMonth(), day.getDate()); to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1); }
  else if (month === "all") { from = new Date(year, 0, 1); to = new Date(year + 1, 0, 1); }
  else { from = new Date(year, month, 1); to = new Date(year, month + 1, 1); }
  return { from: from < floor ? floor : from, to: to > ceil ? ceil : to };
}
