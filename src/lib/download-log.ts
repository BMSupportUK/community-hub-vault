/** Shared, browser-safe download-log rules. */
export const DOWNLOAD_SOURCES = {
  enabler_phone: "BM TV Enabler (phone)",
  enabler_windows: "BM TV Enabler (Windows)",
  tv_install: "Installed on TV by Enabler",
  remote_helper: "BM Remote Helper",
  transfer_link: "Secure download link",
  android_apk: "BM Support phone app",
  self_install: "Self install (no staff help)",
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

/** UK (Europe/London) year and month for one log entry, so days land in the same tabs admins see. */
export function logPeriod(iso: string): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric" })
    .formatToParts(new Date(iso));
  return { year: parts.find((p) => p.type === "year")!.value, month: String(Number(parts.find((p) => p.type === "month")!.value)) };
}

export function logYearOptions(rows: { createdAt: string }[]): string[] {
  return [...new Set(rows.map((r) => logPeriod(r.createdAt).year))].sort((a, b) => b.localeCompare(a));
}

export function logMonthOptions(rows: { createdAt: string }[], year: string): string[] {
  return [...new Set(rows.filter((r) => logPeriod(r.createdAt).year === year).map((r) => logPeriod(r.createdAt).month))]
    .sort((a, b) => Number(a) - Number(b));
}

export function logMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Europe/London" })
    .format(new Date(2026, Number(month) - 1, 1));
}

export function isWithinPeriod(iso: string, year: string, month: string): boolean {
  const p = logPeriod(iso);
  return (year === "all" || p.year === year) && (month === "all" || p.month === month);
}
