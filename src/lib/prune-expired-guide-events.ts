import { findEarliestEventUtcMs, findLatestEventUtcMs, isGuideDateHeading } from "./parse-event-times";

const ZONE_TOKENS =
  "GMT|UTC|UK|BST|CET|CEST|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|AEST|AEDT|JST|IST";

/**
 * Guides written from US schedules often declare the zone once ("All times ET")
 * instead of tagging every row. Without that, bare times are read as UK time and
 * an ET listing looks expired (or still live) at the wrong moment, so expiry has
 * to honour the declared zone for the whole body.
 */
function detectBodyZone(lines: string[]): string | undefined {
  const declared = new RegExp(`\\ball\\s+times?\\b[^a-z0-9]*(?:are|in|shown\\s+in)?[^a-z0-9]*(${ZONE_TOKENS})\\b`, "i");
  const bare = new RegExp(`^\\(?\\s*(${ZONE_TOKENS})\\s*\\)?$`, "i");
  for (const line of lines) {
    if (!line) continue;
    const hit = line.match(declared) ?? line.match(bare);
    if (hit?.[1]) return hit[1].toUpperCase();
  }
  return undefined;
}

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
  const bodyZone = detectBodyZone(lines);
  const zoneArgs = bodyZone ? ([bodyZone] as const) : ([] as const);

  type Group = { heading: string | null; events: string[][] };
  const groups: Group[] = [];
  let current: Group = { heading: null, events: [] };
  let event: string[] = [];

  const closeEvent = () => {
    if (event.length) current.events.push(event);
    event = [];
  };

  for (const line of lines) {
    if (!line) continue;
    if (isGuideDateHeading(line)) {
      closeEvent();
      if (current.heading !== null || current.events.length) groups.push(current);
      current = { heading: line, events: [] };
      continue;
    }

    // Rich-text editors frequently wrap every row in nested divs. Their
    // closing tags create apparent blank lines between the time, title and
    // channel rows, so blank lines cannot reliably delimit an event. A new
    // parsable time row is the stable boundary used by every guide format.
    const lineContext = `${current.heading ? `${current.heading}\n` : ""}${line}`;
    let startsEvent = false;
    try {
      startsEvent = findLatestEventUtcMs(lineContext, ...zoneArgs) !== null;
    } catch {
      startsEvent = false;
    }
    if (startsEvent && event.length) closeEvent();
    event.push(line);
  }
  closeEvent();
  if (current.heading !== null || current.events.length) groups.push(current);

  let removedAny = false;
  const out: string[] = [];

  for (const group of groups) {
    const kept: string[][] = [];
    for (const event of group.events) {
      const context = `${group.heading ? `${group.heading}\n` : ""}${event.join("\n")}`;
      let latest: number | null = null;
      try {
        // Expiry is measured from the event's START time, so use the earliest
        // parsable instant in the block — a channel row or secondary time must
        // not keep an already-played event alive.
        latest = findEarliestEventUtcMs(context, ...zoneArgs);
      } catch {
        latest = null;
      }
      // Keep the event for the full grace period. It becomes removable only
      // when the clock reaches its listed start time plus exactly 10 hours.
      if (latest !== null && nowMs >= latest + graceMs) {
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
