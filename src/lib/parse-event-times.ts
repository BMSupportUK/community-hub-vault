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
        results.push({
          start: bm.index,
          end: bm.index + bm[0].length,
          converted: `${dayDate} ${hh}${abbr ? ` ${abbr}` : ""}`,
          sourcePrefix: `${sourceDayDate} `,
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
  // Remove any previously inserted pills so re-runs stay idempotent.
  root.querySelectorAll("[data-tz-pill]").forEach((n) => n.remove());
  root.querySelectorAll("[data-tz-source-pill]").forEach((n) => {
    const parent = n.parentNode;
    if (!parent) return;
    // Unwrap: replace pill with its text content
    parent.replaceChild(document.createTextNode(n.textContent ?? ""), n);
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-tz-pill]")) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-tz-source-pill]")) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "CODE" || tag === "PRE") return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let cur: Node | null = walker.nextNode();
  while (cur) {
    targets.push(cur as Text);
    cur = walker.nextNode();
  }

  for (const textNode of targets) {
    const text = textNode.nodeValue ?? "";
    const matches = parseMatches(text, viewerTz, defaultZone);
    if (!matches.length) continue;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));

      // Wrapper holds source pill (GMT, muted) FIRST, then converted pill (local, fuchsia)
      const wrapper = document.createElement("span");
      wrapper.setAttribute("data-tz-pill", "1");
      wrapper.className = "inline-flex flex-wrap items-center gap-2 align-baseline";

      // Source-time pill (the original written time) — muted, listed first
      const sourcePill = document.createElement("span");
      sourcePill.setAttribute("data-tz-source-pill", "1");
      sourcePill.className =
        "inline-flex items-center px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-purple-100/80 text-xs font-semibold align-baseline";
      sourcePill.textContent = `${m.sourcePrefix ?? ""}${text.slice(m.start, m.end)}`;
      wrapper.appendChild(sourcePill);

      // Converted pill (viewer's timezone) — primary, bold fuchsia
      const convertedPill = document.createElement("span");
      convertedPill.className =
        "inline-flex items-center px-3 py-1 rounded-lg bg-fuchsia-600 text-white text-xs font-bold shadow-[0_0_15px_rgba(192,38,211,0.25)] align-baseline";
      convertedPill.textContent = m.converted;
      wrapper.appendChild(convertedPill);
      frag.appendChild(wrapper);

      cursor = m.end;
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}