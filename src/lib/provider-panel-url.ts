export const DEFAULT_PANEL_URL = "https://footballfantasy26.com";
/** Returns the origin (no trailing slash/path) or null when not a valid https address. */
export function normalisePanelUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    return u.origin;
  } catch { return null; }
}
