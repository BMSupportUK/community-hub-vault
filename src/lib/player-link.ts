// Shared, browser-safe BM Player rules (codes, DNS, problem reports).

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_FAILED_CODE_ATTEMPTS_PER_HOUR = 10;
export const PENDING_CREDENTIAL_TTL_MS = 60 * 60 * 1000;

export function isValidLinkCode(code: string) {
  return /^\d{6}$/.test(code.replace(/\s+/g, ""));
}
export function normaliseLinkCode(code: string) {
  return code.replace(/\s+/g, "");
}

/** A link code works once, and only until it expires. */
export function linkCodeUsable(row: { expires_at: string; used_at: string | null } | null, now = Date.now()) {
  if (!row || row.used_at) return false;
  return new Date(row.expires_at).getTime() > now;
}

/** DNS must be an http(s) address, optional port, no path/query beyond a trailing slash. */
export function normaliseDns(input: string): string | null {
  const v = input.trim().replace(/\/+$/, "");
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if ((u.pathname && u.pathname !== "/") || u.search || u.hash || u.username) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export type ReportKind = "live" | "film" | "series";
export const REPORT_KINDS: Record<ReportKind, { label: string; categorySlug: string }> = {
  live: { label: "Live TV", categorySlug: "live-tv" },
  film: { label: "Film", categorySlug: "movies-series" },
  series: { label: "Series", categorySlug: "movies-series" },
};

export interface ReportPrefill { kind: ReportKind; title?: string; category?: string; device?: string }

const clean = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) || undefined : undefined;

export function parseReportSearch(s: Record<string, unknown>): ReportPrefill | undefined {
  const kind = s.report;
  if (kind !== "live" && kind !== "film" && kind !== "series") return undefined;
  return { kind, title: clean(s.title, 120), category: clean(s.cat, 80), device: clean(s.device, 60) };
}

export function reportTicketText(p: ReportPrefill) {
  const kind = REPORT_KINDS[p.kind].label;
  const subject = `${kind} problem${p.title ? ` – ${p.title}` : ""}`.slice(0, 120);
  const lines = [
    `Type: ${kind}`,
    p.title ? `${p.kind === "live" ? "Channel" : "Title"}: ${p.title}` : null,
    p.category ? `Category: ${p.category}` : null,
    p.device ? `Device: ${p.device}` : null,
    "",
    "What's wrong? (e.g. buffering, not loading, wrong programme, no sound):",
    "",
  ].filter((l) => l !== null);
  return { subject, message: lines.join("\n") };
}

export function reportLink(origin: string, p: ReportPrefill) {
  const q = new URLSearchParams({ report: p.kind });
  if (p.title) q.set("title", p.title);
  if (p.category) q.set("cat", p.category);
  if (p.device) q.set("device", p.device);
  return `${origin.replace(/\/+$/, "")}/tickets?${q.toString()}`;
}
