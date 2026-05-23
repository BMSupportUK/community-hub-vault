import { zonedWallTimeToUtcMs, dateInTimeZone } from "@/hooks/use-timezone";

// Abbreviation -> IANA zone. IANA zones already handle DST correctly.
const ZONE_MAP: Record<string, string> = {
  // Map GMT to Europe/London so the source time follows UK clocks and
  // automatically shifts to BST during British Summer Time.
  GMT: "Europe/London",
  UTC: "Etc/UTC",
  UK: "Europe/London",
  BST: "Europe/London",
  ET: "America/New_York",
  EST: "America/New_York",
  EDT: "America/New_York",
  CT: "America/Chicago",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MT: "America/Denver",
  MST: "America/Denver",
  MDT: "America/Denver",
  PT: "America/Los_Angeles",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  CET: "Europe/Paris",
  CEST: "Europe/Paris",
  AEST: "Australia/Sydney",
  AEDT: "Australia/Sydney",
  JST: "Asia/Tokyo",
  IST: "Asia/Kolkata",
};

const ZONE_TOKENS = Object.keys(ZONE_MAP)
  .sort((a, b) => b.length - a.length)
  .join("|");
// Matches: "19:45 GMT", "7:30pm ET", "8 pm CET", "20:00 UTC+1", "9am GMT-05:30"
const TIME_RE = new RegExp(
  `\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\s*(?:(${ZONE_TOKENS})|(?:(UTC|GMT)\\s*([+-])\\s*(\\d{1,2})(?::?(\\d{2}))?))\\b`,
  "gi",
);
// Bare time without an explicit zone (e.g. "19:45", "7:30pm", "8 pm").
// Used when caller specifies a defaultZone (e.g. sports guide is always GMT).
const BARE_TIME_RE = new RegExp(
  `\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\b`,
  "gi",
);

function tzOffsetMinutes(instantMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return (asUtc - instantMs) / 60000;
}

function tzAbbrev(instantMs: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(new Date(instantMs));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

function sourceDateLabelFromHeading(text: string, dateStr: string): string {
  const weekday = text.trim().match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*/i)?.[0];
  const weekdayName = weekday
    ? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1).toLowerCase()}`
    : null;
  const [, month, day] = dateStr.split("-").map((part) => parseInt(part, 10));
  const monthYear = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateStr}T00:00:00Z`));
  return weekdayName ? `${weekdayName} ${day} ${monthYear}` : `${day} ${monthYear}`;
}

interface ParsedMatch {
  start: number;
  end: number;
  converted: string;
  sourcePrefix?: string;
  sourceTime: string;
  sourceZone: string;
  localTime: string;
  localZone: string;
  sourceDate: string;
  localDate: string;
  raw: string;
  utcMs: number;
}

export interface EventTime {
  source: string;
  converted: string;
}

function parseMatches(
  text: string,
  viewerTz: string,
  defaultZone?: string,
  sourceDateStr?: string,
  sourceDateLabel?: string,
): ParsedMatch[] {
  const results: ParsedMatch[] = [];
  const inlineDate = parseLeadingGuideDate(text);
  const effectiveSourceDateStr = inlineDate?.dateStr ?? sourceDateStr;
  const effectiveSourceDateLabel = inlineDate?.sourceDateLabel ?? sourceDateLabel;
  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(text)) !== null) {
    const [, hStr, mStr, ampmRaw, abbrev, offsetBase, sign, offHStr, offMStr] = m;
    let hour = parseInt(hStr, 10);
    const minute = mStr ? parseInt(mStr, 10) : 0;
    if (hour > 23 || minute > 59) continue;
    const ampm = ampmRaw?.toLowerCase().replace(/\./g, "");
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    if (!ampm && hour > 23) continue;
    // Need either ampm or HH:MM form to count as a real time
    if (!ampm && !mStr) continue;

    const todayUtc = new Date();
    let utcMs: number;
    let sourceLabel: string;

    if (abbrev) {
      const tz = ZONE_MAP[abbrev.toUpperCase()];
      if (!tz) continue;
      const dateStr = effectiveSourceDateStr ?? dateInTimeZone(todayUtc, tz);
      const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
      utcMs = zonedWallTimeToUtcMs(dateStr, timeStr, tz);
      sourceLabel = tz;
    } else if (offsetBase && sign && offHStr) {
      const offH = parseInt(offHStr, 10);
      const offM = offMStr ? parseInt(offMStr, 10) : 0;
      const offsetMin = (offH * 60 + offM) * (sign === "-" ? -1 : 1);
      // Source wall time interpreted at this offset:
      const todayStr = effectiveSourceDateStr ?? new Date().toISOString().slice(0, 10);
      const naiveUtc = Date.parse(
        `${todayStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
      );
      utcMs = naiveUtc - offsetMin * 60000;
      sourceLabel = "offset";
    } else {
      continue;
    }

    if (!Number.isFinite(utcMs)) continue;

    const hh = new Intl.DateTimeFormat("en-GB", {
      timeZone: viewerTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(utcMs));
    const abbr = tzAbbrev(utcMs, viewerTz) || viewerTz;
    const dayDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: viewerTz,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(utcMs));
    const sourceTz = sourceLabel !== "offset" ? sourceLabel : viewerTz;
    const sourceDayDate =
      effectiveSourceDateLabel ??
      new Intl.DateTimeFormat("en-GB", {
        timeZone: sourceTz,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(utcMs));
    const sourceHH = new Intl.DateTimeFormat("en-GB", {
      timeZone: sourceTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(utcMs));
    const sourceAbbr =
      sourceLabel !== "offset"
        ? tzAbbrev(utcMs, sourceTz) || "GMT"
        : tzAbbrev(utcMs, viewerTz) || "";
    results.push({
      start: m.index,
      end: m.index + m[0].length,
      converted: `${dayDate} ${hh}${abbr ? ` ${abbr}` : ""}`,
      sourcePrefix: `${sourceDayDate} `,
      sourceTime: sourceHH,
      sourceZone: sourceAbbr,
      localTime: hh,
      localZone: abbr,
      sourceDate: sourceDayDate,
      localDate: dayDate,
      raw: m[0],
      utcMs,
    });
  }
  if (defaultZone) {
    const tz = ZONE_MAP[defaultZone.toUpperCase()];
    if (tz) {
      BARE_TIME_RE.lastIndex = 0;
      let bm: RegExpExecArray | null;
      while ((bm = BARE_TIME_RE.exec(text)) !== null) {
        // Skip if this span overlaps a zone-tagged match already captured
        if (results.some((r) => bm!.index < r.end && bm!.index + bm![0].length > r.start)) continue;
        const [, hStr, mStr, ampmRaw] = bm;
        let hour = parseInt(hStr, 10);
        const minute = mStr ? parseInt(mStr, 10) : 0;
        if (hour > 23 || minute > 59) continue;
        const ampm = ampmRaw?.toLowerCase().replace(/\./g, "");
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        if (!ampm && hour > 23) continue;
        if (!ampm && !mStr) continue;
        const todayUtc = new Date();
        const dateStr = effectiveSourceDateStr ?? dateInTimeZone(todayUtc, tz);
        const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
        const utcMs = zonedWallTimeToUtcMs(dateStr, timeStr, tz);
        if (!Number.isFinite(utcMs)) continue;
        const hh = new Intl.DateTimeFormat("en-GB", {
          timeZone: viewerTz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(utcMs));
        const abbr = tzAbbrev(utcMs, viewerTz) || viewerTz;
        const dayDate = new Intl.DateTimeFormat("en-GB", {
          timeZone: viewerTz,
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(utcMs));
        const sourceDayDate =
          effectiveSourceDateLabel ??
          new Intl.DateTimeFormat("en-GB", {
            timeZone: tz,
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(new Date(utcMs));
        const sourceHH = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(utcMs));
        const sourceAbbr = tzAbbrev(utcMs, tz) || defaultZone.toUpperCase();
        results.push({
          start: bm.index,
          end: bm.index + bm[0].length,
          converted: `${dayDate} ${hh}${abbr ? ` ${abbr}` : ""}`,
          sourcePrefix: `${sourceDayDate} `,
          sourceTime: sourceHH,
          sourceZone: sourceAbbr,
          localTime: hh,
          localZone: abbr,
          sourceDate: sourceDayDate,
          localDate: dayDate,
          raw: bm[0],
          utcMs,
        });
      }
      results.sort((a, b) => a.start - b.start);
    }
  }
  return results;
}

/**
 * Strip HTML and return matched event times (source text + viewer-tz time).
 * Useful for showing a summary pill on list/card views.
 */
export function findEventTimes(html: string, viewerTz: string): EventTime[] {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = parseMatches(text, viewerTz);
  return matches.map((m) => ({
    source: text.slice(m.start, m.end),
    converted: m.converted,
  }));
}

function parseGuideDate(text: string): string | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const weekdayPrefix = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[\s,]*/i;
  if (!weekdayPrefix.test(trimmed) || !/\d/.test(trimmed) || trimmed.length >= 80) return null;
  const withoutWeekday = trimmed.replace(weekdayPrefix, "").trim();
  const numeric = withoutWeekday.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (numeric) {
    const [, d, m, y] = numeric;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const named = withoutWeekday.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{2}|\d{4})$/i);
  if (named) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const [, d, mon, y] = named;
    const month = months.findIndex((m) => mon.toLowerCase().startsWith(m)) + 1;
    if (!month) return null;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return `${year}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseLeadingGuideDate(text: string): { dateStr: string; sourceDateLabel: string } | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const leading = trimmed.match(
    /^((?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[\s,]+)?(?:\d{1,2}[-/.]\d{1,2}[-/.](?:\d{2}|\d{4})|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+(?:\d{2}|\d{4})))(?=\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b)/i,
  )?.[1];
  if (!leading) return null;
  const hasWeekday = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.test(leading);
  const dateStr = parseGuideDate(hasWeekday ? leading : `Monday ${leading}`);
  if (!dateStr) return null;
  return {
    dateStr,
    sourceDateLabel: sourceDateLabelFromHeading(hasWeekday ? leading : "", dateStr),
  };
}

function isWeekdayOnly(text: string): boolean {
  return /^(mon|tue|wed|thu|fri|sat|sun)(day)?$/i.test(text.trim());
}

export function annotateTimesInEl(root: HTMLElement, viewerTz: string, defaultZone?: string): void {
  // Restore any previously transformed rows back to their original markup so
  // re-runs (e.g. body content changed) stay idempotent.
  root.querySelectorAll("[data-tz-row]").forEach((row) => {
    const original = (row as HTMLElement).dataset.tzOriginal;
    if (original != null) {
      row.innerHTML = original;
      (row as HTMLElement).className = (row as HTMLElement).dataset.tzPrevClass ?? "";
      row.removeAttribute("data-tz-row");
      delete (row as HTMLElement).dataset.tzOriginal;
      delete (row as HTMLElement).dataset.tzPrevClass;
    }
  });

  // Hide any element whose entire visible text is just a date heading
  // like "Saturday 23-05-26" or "Saturday, 23 May 2026". Runs across ALL
  // tags (h1-h6, strong, span, div, p, li...) so editor formatting can't
  // hide them from the row-block pass.
  const isDateOnly = (s: string) => Boolean(parseGuideDate(s));
  Array.from(root.querySelectorAll<HTMLElement>("*")).forEach((el) => {
    if (el.closest("[data-tz-row]")) return;
    const t = (el.textContent ?? "").trim();
    if (!t || !isDateOnly(t)) return;
    // Only hide a leaf-ish node — skip if a child element also matches
    // (we'll get to the child on its own iteration and hiding the parent
    // would over-hide).
    const childMatch = Array.from(el.children).some((c) =>
      isDateOnly((c.textContent ?? "").trim()),
    );
    if (childMatch) return;
    if (el.dataset.tzOriginal == null) {
      el.dataset.tzOriginal = el.innerHTML;
      el.dataset.tzPrevClass = el.className;
    }
    el.setAttribute("data-tz-row", "1");
    el.className = "hidden";
  });

  const BLOCK_SELECTOR = "li, p, tr, div, h1, h2, h3, h4, h5, h6";
  const INLINE_LINE_SELECTOR = "b, strong";
  // Some pasted editor content stores the first event time as direct text in a
  // wrapper div before nested event-name/source divs. Move that loose leading
  // text into its own line so it can be numbered like the later events.
  Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).forEach((el) => {
    if (el.closest("[data-tz-row]")) return;
    const firstBlockChild = Array.from(el.children).find((child) =>
      (child as HTMLElement).matches(BLOCK_SELECTOR),
    );
    if (!firstBlockChild) return;
    const leadingNodes: ChildNode[] = [];
    for (const node of Array.from(el.childNodes)) {
      if (node === firstBlockChild) break;
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).matches(BLOCK_SELECTOR)) break;
      leadingNodes.push(node);
    }
    const leadingText = leadingNodes.map((node) => node.textContent ?? " ").join(" ").trim();
    if (!leadingText || !parseMatches(leadingText, viewerTz, defaultZone).length) return;
    const line = document.createElement("div");
    for (const node of leadingNodes) line.appendChild(node);
    el.insertBefore(line, firstBlockChild);
  });

  // Pick blocks that look like a single schedule entry. The rich-text editor
  // wraps lines in <div>, so include that — but only leaf-level blocks
  // (no nested block children) so we don't wipe a wrapping <div> that
  // contains multiple lines.
  const hasBlockAncestor = (el: HTMLElement) => {
    let parent = el.parentElement;
    while (parent && parent !== root) {
      if (parent.matches(BLOCK_SELECTOR)) return true;
      parent = parent.parentElement;
    }
    return false;
  };
  const isLineElement = (el: HTMLElement) =>
    (el.matches(BLOCK_SELECTOR) && !el.querySelector(BLOCK_SELECTOR)) ||
    (el.matches(INLINE_LINE_SELECTOR) && !hasBlockAncestor(el));
  const all = Array.from(
    root.querySelectorAll<HTMLElement>(`${BLOCK_SELECTOR}, ${INLINE_LINE_SELECTOR}`),
  );
  const blocks = all.filter(isLineElement).sort((a, b) => {
    const position = a.compareDocumentPosition(b);
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  let rowIndex = 0;
  let currentSourceDate: string | null = null;
  let currentSourceDateLabel: string | null = null;
  for (const [blockIndex, block] of blocks.entries()) {
    // Skip nested blocks (e.g. <p> inside <li>) — outer wins, but we mark
    // already-transformed rows so descendants don't double-process.
    if (block.closest("[data-tz-row]")) {
      const skippedDate = parseGuideDate(block.textContent ?? "");
      if (skippedDate) {
        currentSourceDate = skippedDate;
        currentSourceDateLabel = sourceDateLabelFromHeading(block.textContent ?? "", skippedDate);
      }
      continue;
    }

    const text = block.textContent ?? "";
    if (!text.trim()) continue;
    const parsedBlockDate = parseGuideDate(text);
    if (parsedBlockDate) {
      currentSourceDate = parsedBlockDate;
      currentSourceDateLabel = sourceDateLabelFromHeading(text, parsedBlockDate);
    }
    const rowSourceDate = currentSourceDate;
    const rowSourceDateLabel = currentSourceDateLabel;
    const matches = parseMatches(
      text,
      viewerTz,
      defaultZone,
      rowSourceDate ?? undefined,
      rowSourceDateLabel ?? undefined,
    );
    if (!matches.length) {
      // Hide standalone date headings like "Saturday 23-05-26" or
      // "Saturday, 23 May 2026" — the per-row pills already show the date.
      const trimmed = text.trim();
      const dateOnly = Boolean(parseGuideDate(trimmed));
      if (dateOnly) {
        if (block.dataset.tzOriginal == null) {
          block.dataset.tzOriginal = block.innerHTML;
          block.dataset.tzPrevClass = block.className;
        }
        block.setAttribute("data-tz-row", "1");
        block.className = "hidden";
      }
      continue;
    }

    const m = matches[0];
    // Derive event name = text with the matched time substring removed.
    let eventName = (text.slice(0, m.start) + " " + text.slice(m.end))
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–—:·•|]+|[\s\-–—:·•|]+$/g, "")
      .trim();
    if (isWeekdayOnly(eventName)) eventName = "";
    // If subsequent matches exist, their text becomes a caption.
    let caption = "";
    if (matches.length > 1) {
      caption = matches
        .slice(1)
        .map((mx) => text.slice(mx.start, mx.end))
        .join(" · ");
    }

    // Absorb following leaf lines as name/caption even when the editor wrapped
    // them in extra containers. Stop cleanly at the next time or date heading.
    const absorbed: HTMLElement[] = [];
    for (const candidate of blocks.slice(blockIndex + 1)) {
      const sText = (candidate.textContent ?? "").trim();
      if (!sText) continue;
      const parsedSiblingDate = parseGuideDate(sText);
      if (parsedSiblingDate) {
        currentSourceDate = parsedSiblingDate;
        currentSourceDateLabel = sourceDateLabelFromHeading(sText, parsedSiblingDate);
        if (candidate.dataset.tzOriginal == null) {
          candidate.dataset.tzOriginal = candidate.innerHTML;
          candidate.dataset.tzPrevClass = candidate.className;
        }
        candidate.setAttribute("data-tz-row", "1");
        candidate.className = "hidden";
        break;
      }
      if (candidate.closest("[data-tz-row]")) continue;
      if (
        parseMatches(
          sText,
          viewerTz,
          defaultZone,
          currentSourceDate ?? undefined,
          currentSourceDateLabel ?? undefined,
        ).length
      )
        break;
      absorbed.push(candidate);
      if (absorbed.length >= 8) break;
    }
    if (absorbed[0]) {
      eventName = (absorbed[0].textContent ?? "").trim() || eventName;
    }
    if (absorbed.length > 1) {
      const extras = absorbed
        .slice(1)
        .map((a) => (a.textContent ?? "").trim())
        .filter(Boolean)
        .join(" · ");
      if (extras) caption = caption ? `${caption} · ${extras}` : extras;
    }
    for (const a of absorbed) {
      if (a.dataset.tzOriginal == null) {
        a.dataset.tzOriginal = a.innerHTML;
        a.dataset.tzPrevClass = a.className;
      }
      a.setAttribute("data-tz-row", "1");
      a.className = "hidden";
    }

    if (!eventName) eventName = "Event";

    rowIndex += 1;
    const number = String(rowIndex).padStart(2, "0");

    // Preserve original markup so we can restore on re-run.
    block.dataset.tzOriginal = block.innerHTML;
    block.dataset.tzPrevClass = block.className;
    block.setAttribute("data-tz-row", "1");
    block.dataset.tzUtc = String(m.utcMs);
    block.className =
      "group not-prose list-none m-0 flex flex-col gap-3 overflow-hidden p-4 rounded-xl bg-purple-950/40 border border-purple-500/20 hover:border-fuchsia-500/60 transition-colors";

    block.innerHTML = "";

    // Header row: number + (event name / channel)
    const header = document.createElement("div");
    header.className = "flex min-w-0 items-start gap-3";
    const numCell = document.createElement("span");
    numCell.className =
      "font-display text-2xl font-bold text-purple-200/60 group-hover:text-fuchsia-400 tabular-nums w-10 shrink-0 leading-none pt-0.5";
    numCell.textContent = number;
    header.appendChild(numCell);

    const nameCell = document.createElement("div");
    nameCell.className = "min-w-0 flex-1";
    // Detect a channel list (multiple channels separated by · • |) on the
    // left side of a " : " or " - " separator. The event title always
    // renders on a single line; channels go on a second line.
    let channel = "";
    let titleText = eventName;
    const splitMatch = eventName.match(/^\s*(.+?)\s*[:\-–—]\s+(.+)$/);
    if (splitMatch) {
      const left = splitMatch[1].trim();
      const channels = left.split(/\s*[·•|]\s*/).filter(Boolean);
      if (channels.length > 1) {
        channel = channels.join(" | ");
        titleText = splitMatch[2].trim();
      }
    }
    const nameEl = document.createElement("div");
    nameEl.className =
      "min-w-0 truncate whitespace-nowrap text-white font-bold text-lg md:text-xl leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]";
    nameEl.textContent = titleText;
    nameCell.appendChild(nameEl);
    if (channel) {
      const chanWrap = document.createElement("div");
      chanWrap.className =
        "mt-2 min-w-0 truncate text-xs md:text-sm font-semibold tracking-wide text-fuchsia-100";
      chanWrap.textContent = channel;
      nameCell.appendChild(chanWrap);
    }
    if (caption) {
      const capEl = document.createElement("div");
      capEl.className = "mt-1.5 text-sm text-purple-100/80 break-words leading-snug";
      capEl.textContent = caption;
      nameCell.appendChild(capEl);
    }
    header.appendChild(nameCell);
    block.appendChild(header);

    // Pills row: fixed two-column grid so pill positions stay aligned on every row.
    const pillsRow = document.createElement("div");
    pillsRow.className = "grid w-full grid-cols-2 gap-2 pl-0 md:pl-[3.25rem]";
    block.appendChild(pillsRow);

    // Source pill (muted) — listed FIRST after name to match mockup order request
    const sourcePill = document.createElement("span");
    sourcePill.setAttribute("data-tz-pill", "1");
    sourcePill.className =
      "inline-flex w-full min-w-0 max-w-full flex-col items-center justify-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-purple-100/80";
    const srcDate = document.createElement("span");
    srcDate.className =
      "block w-full text-center text-[11px] md:text-xs font-bold uppercase tracking-wider text-fuchsia-200 leading-tight mb-0.5";
    srcDate.textContent = m.sourceDate;
    const srcRow = document.createElement("span");
    srcRow.className = "flex w-full min-w-0 items-baseline justify-center gap-1.5";
    const srcTime = document.createElement("span");
    srcTime.className = "font-bold text-sm tabular-nums";
    srcTime.textContent = m.sourceTime;
    const srcZone = document.createElement("span");
    srcZone.className = "min-w-0 truncate text-[10px] uppercase tracking-wide text-purple-200/60";
    srcZone.textContent = m.sourceZone;
    srcRow.appendChild(srcTime);
    srcRow.appendChild(srcZone);
    sourcePill.appendChild(srcDate);
    sourcePill.appendChild(srcRow);
    pillsRow.appendChild(sourcePill);

    // Local pill (fuchsia, bold)
    const localPill = document.createElement("span");
    localPill.setAttribute("data-tz-pill", "1");
    localPill.className =
      "inline-flex w-full min-w-0 max-w-full flex-col items-center justify-center px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white shadow-[0_0_15px_rgba(192,38,211,0.25)]";
    const locDate = document.createElement("span");
    locDate.className =
      "block w-full text-center text-[11px] md:text-xs font-bold uppercase tracking-wider text-white leading-tight mb-0.5";
    locDate.textContent = m.localDate;
    const locRow = document.createElement("span");
    locRow.className = "flex w-full min-w-0 items-baseline justify-center gap-1.5";
    const locTime = document.createElement("span");
    locTime.className = "font-bold text-sm tabular-nums";
    locTime.textContent = m.localTime;
    const locZone = document.createElement("span");
    locZone.className = "min-w-0 truncate text-[10px] uppercase tracking-wide text-white/80";
    locZone.textContent = m.localZone;
    locRow.appendChild(locTime);
    locRow.appendChild(locZone);
    localPill.appendChild(locDate);
    localPill.appendChild(locRow);
    pillsRow.appendChild(localPill);

    // Keep transformed content to two text lines plus the time pills.
  }

  // Sort all transformed event rows by earliest source time and renumber.
  const eventRows = Array.from(
    root.querySelectorAll<HTMLElement>("[data-tz-row][data-tz-utc]"),
  );
  if (eventRows.length >= 1) {
    // Anchor at the first row's top-level ancestor within root, then reparent
    // every row to be a direct child of `root`. This bypasses editor wrappers
    // (grids, columns, extra divs) so rows always stack vertically full-width.
    const topAncestor = (el: HTMLElement): HTMLElement => {
      let cur: HTMLElement = el;
      while (cur.parentElement && cur.parentElement !== root) cur = cur.parentElement;
      return cur;
    };
    const anchorEl = topAncestor(eventRows[0]);
    const placeholder = document.createComment("tz-sort-anchor");
    root.insertBefore(placeholder, anchorEl);
    const sorted = [...eventRows].sort(
      (a, b) => Number(a.dataset.tzUtc) - Number(b.dataset.tzUtc),
    );
    for (const el of sorted) {
      el.remove();
      root.insertBefore(el, placeholder);
    }
    placeholder.remove();
    sorted.forEach((el, idx) => {
      // Number cell is the first span inside the header row.
      const numCell = el.querySelector(":scope > div > span");
      if (numCell) numCell.textContent = String(idx + 1).padStart(2, "0");
    });
  }
}
