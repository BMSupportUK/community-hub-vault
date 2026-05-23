import { zonedWallTimeToUtcMs, dateInTimeZone } from "@/hooks/use-timezone";

// Abbreviation -> IANA zone. IANA zones already handle DST correctly.
const ZONE_MAP: Record<string, string> = {
  GMT: "Etc/GMT",
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

const ZONE_TOKENS = Object.keys(ZONE_MAP).sort((a, b) => b.length - a.length).join("|");
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
    timeZone: tz, hour12: false, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return (asUtc - instantMs) / 60000;
}

function tzAbbrev(instantMs: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(instantMs));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
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
}

export interface EventTime {
  source: string;
  converted: string;
}

function parseMatches(text: string, viewerTz: string, defaultZone?: string): ParsedMatch[] {
  const results: ParsedMatch[] = [];
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
      const dateStr = dateInTimeZone(todayUtc, tz);
      const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
      utcMs = zonedWallTimeToUtcMs(dateStr, timeStr, tz);
      sourceLabel = tz;
      // Skip if viewer is in the same zone (same offset right now)
      if (tzOffsetMinutes(utcMs, tz) === tzOffsetMinutes(utcMs, viewerTz)) continue;
    } else if (offsetBase && sign && offHStr) {
      const offH = parseInt(offHStr, 10);
      const offM = offMStr ? parseInt(offMStr, 10) : 0;
      const offsetMin = (offH * 60 + offM) * (sign === "-" ? -1 : 1);
      // Source wall time interpreted at this offset:
      const todayStr = new Date().toISOString().slice(0, 10);
      const naiveUtc = Date.parse(`${todayStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
      utcMs = naiveUtc - offsetMin * 60000;
      sourceLabel = "offset";
      if (tzOffsetMinutes(utcMs, viewerTz) === offsetMin) continue;
    } else {
      continue;
    }

    if (!Number.isFinite(utcMs)) continue;

    const hh = new Intl.DateTimeFormat("en-GB", {
      timeZone: viewerTz,
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(utcMs));
    const abbr = tzAbbrev(utcMs, viewerTz);
    const dayDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: viewerTz, weekday: "long", day: "numeric", month: "long", year: "numeric",
    }).format(new Date(utcMs));
    const sourceTz = sourceLabel !== "offset" ? sourceLabel : viewerTz;
    const sourceDayDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: sourceTz, weekday: "long", day: "numeric", month: "long", year: "numeric",
    }).format(new Date(utcMs));
    const sourceHH = new Intl.DateTimeFormat("en-GB", {
      timeZone: sourceTz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(utcMs));
    const sourceAbbr = sourceLabel !== "offset"
      ? (tzAbbrev(utcMs, sourceTz) || "GMT")
      : (tzAbbrev(utcMs, viewerTz) || "");
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
        const dateStr = dateInTimeZone(todayUtc, tz);
        const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
        const utcMs = zonedWallTimeToUtcMs(dateStr, timeStr, tz);
        if (!Number.isFinite(utcMs)) continue;
        if (tzOffsetMinutes(utcMs, tz) === tzOffsetMinutes(utcMs, viewerTz)) continue;
        const hh = new Intl.DateTimeFormat("en-GB", {
          timeZone: viewerTz, hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date(utcMs));
        const abbr = tzAbbrev(utcMs, viewerTz);
        const dayDate = new Intl.DateTimeFormat("en-GB", {
          timeZone: viewerTz, weekday: "long", day: "numeric", month: "long", year: "numeric",
        }).format(new Date(utcMs));
        const sourceDayDate = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
        }).format(new Date(utcMs));
        const sourceHH = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
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
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const matches = parseMatches(text, viewerTz);
  return matches.map((m) => ({
    source: text.slice(m.start, m.end),
    converted: m.converted,
  }));
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

  // Pick blocks that look like a single schedule entry. The rich-text editor
  // wraps lines in <div>, so include that — but only leaf-level blocks
  // (no nested block children) so we don't wipe a wrapping <div> that
  // contains multiple lines.
  const BLOCK_SELECTOR = "li, p, tr, div";
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const blocks = all.filter(
    (el) => !el.querySelector(BLOCK_SELECTOR),
  );

  let rowIndex = 0;
  for (const block of blocks) {
    // Skip nested blocks (e.g. <p> inside <li>) — outer wins, but we mark
    // already-transformed rows so descendants don't double-process.
    if (block.closest("[data-tz-row]") && block.getAttribute("data-tz-row") == null) continue;

    const text = block.textContent ?? "";
    if (!text.trim()) continue;
    const matches = parseMatches(text, viewerTz, defaultZone);
    if (!matches.length) continue;

    const m = matches[0];
    // Derive event name = text with the matched time substring removed.
    let eventName = (text.slice(0, m.start) + " " + text.slice(m.end))
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–—:·•|]+|[\s\-–—:·•|]+$/g, "")
      .trim();
    // If subsequent matches exist, their text becomes a caption.
    let caption = "";
    if (matches.length > 1) {
      caption = matches.slice(1).map((mx) => text.slice(mx.start, mx.end)).join(" · ");
    }
    if (!eventName) eventName = "Event";

    rowIndex += 1;
    const number = String(rowIndex).padStart(2, "0");

    // Preserve original markup so we can restore on re-run.
    block.dataset.tzOriginal = block.innerHTML;
    block.dataset.tzPrevClass = block.className;
    block.setAttribute("data-tz-row", "1");
    block.className =
      "group not-prose list-none my-2 grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 rounded-xl bg-purple-950/40 border border-purple-500/20 hover:border-fuchsia-500/60 transition-colors";

    block.innerHTML = "";

    const numCell = document.createElement("span");
    numCell.className = "font-display text-2xl font-bold text-purple-200/60 group-hover:text-fuchsia-400 tabular-nums w-10";
    numCell.textContent = number;
    block.appendChild(numCell);

    const nameCell = document.createElement("div");
    nameCell.className = "min-w-0";
    const nameEl = document.createElement("div");
    nameEl.className = "text-white font-semibold text-base md:text-lg truncate";
    nameEl.textContent = eventName;
    nameCell.appendChild(nameEl);
    if (caption) {
      const capEl = document.createElement("div");
      capEl.className = "text-xs text-purple-200/60 truncate";
      capEl.textContent = caption;
      nameCell.appendChild(capEl);
    }
    block.appendChild(nameCell);

    // Source pill (muted) — listed FIRST after name to match mockup order request
    const sourcePill = document.createElement("span");
    sourcePill.setAttribute("data-tz-pill", "1");
    sourcePill.className =
      "inline-flex flex-col items-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-purple-100/80 min-w-[140px]";
    const srcDate = document.createElement("span");
    srcDate.className = "text-[9px] uppercase tracking-wide text-purple-200/60 leading-tight";
    srcDate.textContent = m.sourceDate;
    const srcRow = document.createElement("span");
    srcRow.className = "flex items-baseline gap-1.5";
    const srcTime = document.createElement("span");
    srcTime.className = "font-bold text-sm tabular-nums";
    srcTime.textContent = m.sourceTime;
    const srcZone = document.createElement("span");
    srcZone.className = "text-[10px] uppercase tracking-wide text-purple-200/60";
    srcZone.textContent = m.sourceZone;
    srcRow.appendChild(srcTime);
    srcRow.appendChild(srcZone);
    sourcePill.appendChild(srcDate);
    sourcePill.appendChild(srcRow);
    block.appendChild(sourcePill);

    // Local pill (fuchsia, bold)
    const localPill = document.createElement("span");
    localPill.setAttribute("data-tz-pill", "1");
    localPill.className =
      "inline-flex flex-col items-center px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white shadow-[0_0_15px_rgba(192,38,211,0.25)] min-w-[140px]";
    const locDate = document.createElement("span");
    locDate.className = "text-[9px] uppercase tracking-wide text-white/75 leading-tight";
    locDate.textContent = m.localDate;
    const locRow = document.createElement("span");
    locRow.className = "flex items-baseline gap-1.5";
    const locTime = document.createElement("span");
    locTime.className = "font-bold text-sm tabular-nums";
    locTime.textContent = m.localTime;
    const locZone = document.createElement("span");
    locZone.className = "text-[10px] uppercase tracking-wide text-white/80";
    locZone.textContent = m.localZone;
    locRow.appendChild(locTime);
    locRow.appendChild(locZone);
    localPill.appendChild(locDate);
    localPill.appendChild(locRow);
    block.appendChild(localPill);

    const chev = document.createElement("span");
    chev.setAttribute("aria-hidden", "true");
    chev.className = "text-purple-300/40 group-hover:text-fuchsia-400 text-lg leading-none";
    chev.textContent = "›";
    block.appendChild(chev);
  }
}