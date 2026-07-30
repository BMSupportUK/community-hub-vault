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

/** Split a guide body into top-level block segments, preserving their HTML. */
function splitSegments(html: string): string[] {
  const divs = html.match(/<div\b[^>]*>[\s\S]*?<\/div>/gi);
  if (divs && divs.join("").replace(/\s+/g, "").length >= html.replace(/\s+/g, "").length * 0.8) {
    return divs;
  }
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