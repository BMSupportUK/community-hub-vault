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
