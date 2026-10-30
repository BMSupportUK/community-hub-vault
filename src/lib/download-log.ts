/** Shared, browser-safe download-log rules. */
export const DOWNLOAD_SOURCES = {
  enabler_phone: "BM TV Enabler (phone)",
  enabler_windows: "BM TV Enabler (Windows)",
  tv_install: "Installed on TV by Enabler",
  remote_helper: "BM Remote Helper",
  transfer_link: "Secure download link",
  android_apk: "BM Support phone app",
  self_install: "Self install (no staff help)",
  direct_install: "BM Direct Install (TV)",
} as const;
export type DownloadSource = keyof typeof DOWNLOAD_SOURCES;

/** A range request that doesn't start at byte 0 continues a download already logged. */
export function isNewDownload(method: string, rangeHeader: string | null): boolean {
  if (method.toUpperCase() !== "GET") return false;
  return !rangeHeader || /^bytes=0-/.test(rangeHeader.trim());
}

export function downloadSourceLabel(source: string): string {
  return (DOWNLOAD_SOURCES as Record<string, string>)[source] ?? source;
}

/** Last Sunday of a month at 01:00 UTC — the UK clock-change moment, as ms since epoch. */
function ukClockChangeUtcMs(year: number, monthIndex: number): number {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0, 1, 0, 0));
  last.setUTCDate(last.getUTCDate() - last.getUTCDay());
  return last.getTime();
}

/** UK (Europe/London) offset in minutes for a moment: +1 during British Summer Time. */
function ukOffsetMinutes(d: Date): number {
  const y = d.getUTCFullYear();
  const bstStart = ukClockChangeUtcMs(y, 2); // last Sunday of March
  const bstEnd = ukClockChangeUtcMs(y, 9); // last Sunday of October
  return d.getTime() >= bstStart && d.getTime() < bstEnd ? 60 : 0;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** UK (Europe/London) year and month for one log entry, so days land in the same tabs admins see. */
export function logPeriod(iso: string): { year: string; month: string } {
  const d = new Date(iso);
  const uk = new Date(d.getTime() + ukOffsetMinutes(d) * 60_000);
  return { year: String(uk.getUTCFullYear()), month: String(uk.getUTCMonth() + 1) };
}

export function logYearOptions(rows: { createdAt: string }[]): string[] {
  return [...new Set(rows.map((r) => logPeriod(r.createdAt).year))].sort((a, b) => b.localeCompare(a));
}

export function logMonthOptions(rows: { createdAt: string }[], year: string): string[] {
  return [...new Set(rows.filter((r) => logPeriod(r.createdAt).year === year).map((r) => logPeriod(r.createdAt).month))]
    .sort((a, b) => Number(a) - Number(b));
}

export function logMonthLabel(month: string): string {
  return MONTH_LABELS[Number(month) - 1] ?? month;
}

export function isWithinPeriod(iso: string, year: string, month: string): boolean {
  const p = logPeriod(iso);
  return (year === "all" || p.year === year) && (month === "all" || p.month === month);
}
