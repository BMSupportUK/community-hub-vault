import { isEventChannel } from "./player-channel-health";

export type SportsProgramme = { title: string; start: number; end: number };
/** Only continuous official broadcasters; numbered event feeds cannot establish programme completion. */
export function isOfficialSportsChannel(name: string): boolean {
  const n = name.normalize("NFKD").toLowerCase();
  // Provider quality/trailing pipes are decoration, not an event-only marker.
  const channel = name.replace(/(?:\s*\|\s*(?:fhd|hd|sd|uhd|4k|hevc|h265)?\s*)+$/i, "").trim();
  return !isEventChannel(channel) && !/replay|catch.?up|events? only/.test(n)
    && /\b(?:sky sports|tnt sports|bt sport|eurosport|premier sports|espn|bein sports|fox sports|nbc sports|cbs sports|tsn|sportsnet|supersport|willow|ten sports|star sports|sony sports)\b/.test(n);
}
/** DAZN and Peacock event feeds also supply usable, titled provider EPG slots. */
export function acceptsSportsProgrammeEnd(name: string): boolean {
  const normalized = name.normalize("NFKD").toLowerCase();
  return isOfficialSportsChannel(name) || (!/replay|catch.?up/.test(normalized)
    && /\b(?:dazn|peacock)\b/.test(normalized));
}
const words = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(?:live|coverage|football|soccer|boxing|mma|snooker|fc|afc|the)\b/g, " ")
  .replace(/\b(?:vs?\.?|versus)\b|@/g, " v ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

/** Exact event wording within a longer EPG title; never infer completion from a generic league/session name. */
export function programmeMatchesEvent(eventTitle: string, programmeTitle: string): boolean {
  if (!programmeTitle || /\b(?:replay|repeat|highlights?|preview|review|classic|post[ -]?match|half[ -]?time|first half|second half|1st half|2nd half)\b/i.test(programmeTitle)) return false;
  if (/\b(?:prelims?|preliminary|undercard)\b/i.test(eventTitle) !== /\b(?:prelims?|preliminary|undercard)\b/i.test(programmeTitle)) return false;
  const clean = (title: string) => title.replace(/^(?:live\s*)?(?:football|soccer|boxing|snooker|efl|premier league|champions league)\s*:\s*/i, "");
  const event = words(clean(eventTitle)), programme = words(programmeTitle);
  if (event.length < 2 || event.filter(w => w !== "v").length < 2) return false;
  const sides = /\b(?:women|womens|ladies|u\d{2}|youth|reserves)\b/g;
  if ((event.join(" ").match(sides) ?? []).join(" ") !== (programme.join(" ").match(sides) ?? []).join(" ")) return false;
  if (!event.includes("v") && event.filter(w => !/^(?:f1|formula|one|1|motogp|race|sprint|practice|qualifying|grand|prix|live)$/.test(w)).length < 2) return false;
  const joined = ` ${programme.join(" ")} `;
  return joined.includes(` ${event.join(" ")} `);
}

type ProgrammeEvent = { title: string; start: number; channels: string[]; competition?: string };

/** Competition-only WBBL listings are safe only for an explicit live slot with one fixture near its start. */
function womensBigBashSlot(event: ProgrammeEvent, programme: SportsProgramme, events: ProgrammeEvent[]): boolean {
  const competition = (value: string) => value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const isWbbl = (value: string) => /\bwbbl\b/.test(value) || (/\bbig bash league\b/.test(value) && /\bwomens?\b/.test(value));
  const label = competition(programme.title);
  if (!/^live (?:womens big bash league|women big bash league|wbbl)$/.test(label)
    || !isWbbl(competition(event.competition ?? ""))) return false;
  const candidates = events.filter(e => isWbbl(competition(e.competition ?? ""))
    && e.channels.some(c => event.channels.includes(c))
    && e.start >= programme.start && e.start - programme.start <= 30 * 60_000);
  return candidates.length === 1 && candidates[0] === event;
}

export function matchingProgrammeEnd(event: ProgrammeEvent, listings: Map<string, SportsProgramme[]>, events: ProgrammeEvent[] = [event]): number | undefined {
  const matches = event.channels.filter(acceptsSportsProgrammeEnd).flatMap(channel => listings.get(channel.toLowerCase()) ?? [])
    .filter(p => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start && p.end - p.start <= 12 * 3600_000
      && p.start <= event.start + 30 * 60_000 && p.start >= event.start - 2 * 3600_000 && p.end > event.start
      && (programmeMatchesEvent(event.title, p.title) || womensBigBashSlot(event, p, events)));
  return matches.length ? Math.max(...matches.map(p => p.end)) : undefined;
}