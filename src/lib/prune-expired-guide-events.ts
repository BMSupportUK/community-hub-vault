import { findLatestEventUtcMs, isGuideDateHeading } from "./parse-event-times";

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Flatten guide HTML into plain text lines. Guide bodies nest <div> inside
 * <div> (one wrapper per event, sometimes cascading), so block granularity has
 * to come from line breaks, not from the DOM nesting.
 */
function toLines(html: string): string[] {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/(div|p|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decode(withBreaks)
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Remove events whose listed time has already passed from a sports-guide body,
 * keeping only upcoming events. Pruning is per event, so a day that still has
 * upcoming events keeps only those. Date headings left with no remaining events
 * are dropped. Events with no parsable time are kept.
 */
export function pruneExpiredGuideEvents(
  html: string,
  nowMs: number = Date.now(),
  graceMs = 10 * 60 * 60 * 1000,
): string {
  if (!html || !html.trim()) return html;
  const lines = toLines(html);
  if (lines.length === 0) return html;

  type Group = { heading: string | null; events: string[][] };
  const groups: Group[] = [];
  let current: Group = { heading: null, events: [] };
  let block: string[] = [];

  const closeBlock = () => {
    if (block.length) current.events.push(block);
    block = [];
  };

  for (const line of lines) {
    if (!line) {
      closeBlock();
      continue;
    }
    if (isGuideDateHeading(line)) {
      closeBlock();
      if (current.heading !== null || current.events.length) groups.push(current);
      current = { heading: line, events: [] };
      continue;
    }
    block.push(line);
  }
  closeBlock();
  if (current.heading !== null || current.events.length) groups.push(current);

  let removedAny = false;
  const out: string[] = [];

  for (const group of groups) {
    const kept: string[][] = [];
    for (const event of group.events) {
      const context = `${group.heading ? `${group.heading}\n` : ""}${event.join("\n")}`;
      let latest: number | null = null;
      try {
        latest = findLatestEventUtcMs(context);
      } catch {
        latest = null;
      }
      if (latest !== null && latest + graceMs < nowMs) {
        removedAny = true;
      } else {
        kept.push(event);
      }
    }
    if (kept.length === 0) {
      if (group.heading) removedAny = true;
      continue;
    }
    if (group.heading) {
      out.push(`<div>${escapeHtml(group.heading)}</div>`, "<div><br></div>");
    }
    for (const event of kept) {
      for (const line of event) out.push(`<div>${escapeHtml(line)}</div>`);
      out.push("<div><br></div>");
    }
  }

  if (!removedAny) return html;
  while (out.length && out[out.length - 1] === "<div><br></div>") out.pop();
  // If every event has expired, return an empty body. Keeping the original
  // content here resurrects every stale event when the editor is opened.
  if (out.length === 0) return "";
  return out.join("");
}
