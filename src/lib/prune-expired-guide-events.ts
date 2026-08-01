import { findLatestEventUtcMs, isGuideDateHeading } from "./parse-event-times";

/** Strip tags/entities from a single guide segment to get its plain text. */
function segmentText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a guide body into top-level block segments, preserving their HTML.
 * Guide bodies routinely nest <div> inside <div> (one wrapper per event with
 * time/name/channel children), and the date heading is sometimes a bare text
 * node. A depth-aware scan is required — a non-greedy regex would cut nested
 * blocks at the first </div> and drop bare-text headings entirely.
 */
function splitSegments(html: string): string[] {
  const segments: string[] = [];
  const tag = /<(\/?)div\b[^>]*>/gi;
  let depth = 0;
  let blockStart = 0;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html)) !== null) {
    const isClose = m[1] === "/";
    if (!isClose) {
      if (depth === 0) {
        // Any loose text/markup before this block is its own segment.
        const loose = html.slice(cursor, m.index);
        if (loose.trim()) segments.push(loose.trim());
        blockStart = m.index;
      }
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) {
        segments.push(html.slice(blockStart, m.index + m[0].length));
        cursor = m.index + m[0].length;
      }
    }
  }
  const trailing = html.slice(cursor);
  if (depth === 0 && trailing.trim()) segments.push(trailing.trim());

  if (segments.length === 1) {
    // Whole body wrapped in one container — look inside it.
    const inner = segments[0].replace(/^<div\b[^>]*>/i, "").replace(/<\/div>$/i, "");
    if (inner !== segments[0] && /<div\b/i.test(inner)) return splitSegments(inner);
  }
  if (segments.length > 1) return segments;
  return html
    .split(/<br\s*\/?>/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Remove events whose listed time has already passed from a sports-guide body,
 * keeping only upcoming events. Date headings left with no remaining events are
 * dropped too. Blocks with no parsable time are kept (we can't tell if they're
 * expired). Returns the original HTML when nothing can be safely pruned.
 */
export function pruneExpiredGuideEvents(
  html: string,
  nowMs: number = Date.now(),
  graceMs = 10 * 60 * 60 * 1000,
): string {
  if (!html || !html.trim()) return html;
  const segments = splitSegments(html);
  if (segments.length === 0) return html;

  type Block = { segments: string[]; hasContent: boolean };
  const out: string[] = [];
  let heading: string | null = null;
  let headingEmitted = false;
  let block: Block = { segments: [], hasContent: false };
  let removedAny = false;

  const flushBlock = () => {
    if (!block.hasContent) {
      block = { segments: [], hasContent: false };
      return;
    }
    const context = `${heading ? segmentText(heading) + "\n" : ""}${block.segments
      .map(segmentText)
      .join("\n")}`;
    let latest: number | null = null;
    try {
      latest = findLatestEventUtcMs(context);
    } catch {
      latest = null;
    }
    const expired = latest !== null && latest + graceMs < nowMs;
    if (expired) {
      removedAny = true;
    } else {
      if (heading && !headingEmitted) {
        out.push(heading, "<div><br></div>");
        headingEmitted = true;
      }
      out.push(...block.segments, "<div><br></div>");
    }
    block = { segments: [], hasContent: false };
  };

  for (const seg of segments) {
    const text = segmentText(seg);
    if (!text) {
      flushBlock();
      continue;
    }
    if (isGuideDateHeading(text)) {
      flushBlock();
      heading = seg;
      headingEmitted = false;
      continue;
    }
    block.segments.push(seg);
    block.hasContent = true;
  }
  flushBlock();

  if (!removedAny) return html;
  while (out.length && segmentText(out[out.length - 1]) === "") out.pop();
  return out.join("");
}