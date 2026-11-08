import { isEventChannel } from "./player-channel-health";

export type SportsProgramme = { title: string; start: number; end: number };
/** Only continuous official broadcasters; numbered event feeds cannot establish programme completion. */
export function isOfficialSportsChannel(name: string): boolean {
  const n = name.normalize("NFKD").toLowerCase();
  return !isEventChannel(name) && !/replay|catch.?up|events? only/.test(n)
    && /\b(?:sky sports|tnt sports|bt sport|eurosport|premier sports|espn|bein sports|fox sports|nbc sports|cbs sports|tsn|sportsnet|supersport|willow|ten sports|star sports|sony sports)\b/.test(n);
}
const words = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(?:live|coverage|football|soccer|boxing|mma|snooker|fc|afc|the)\b/g, " ")
  .replace(/\b(?:vs?\.?|versus)\b|@/g, " v ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

/** Exact event wording within a longer EPG title; never infer completion from a generic league/session name. */
export function programmeMatchesEvent(eventTitle: string, programmeTitle: string): boolean {
  if (!programmeTitle || /\b(?:replay|highlights?|preview|review|classic|post[ -]?match|half[ -]?time)\b/i.test(programmeTitle)) return false;
  if (/\b(?:prelims?|preliminary|undercard)\b/i.test(eventTitle) !== /\b(?:prelims?|preliminary|undercard)\b/i.test(programmeTitle)) return false;
  const event = words(eventTitle.replace(/^[^:]+:\s*/, "")), programme = words(programmeTitle);
  if (event.length < 2 || event.filter(w => w !== "v").length < 2) return false;
  const joined = ` ${programme.join(" ")} `;
  return joined.includes(` ${event.join(" ")} `);
}

export function matchingProgrammeEnd(event: { title: string; start: number; channels: string[] }, listings: Map<string, SportsProgramme[]>): number | undefined {
  const matches = event.channels.filter(isOfficialSportsChannel).flatMap(channel => listings.get(channel.toLowerCase()) ?? [])
    .filter(p => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start && p.end - p.start <= 12 * 3600_000
      && p.start <= event.start + 30 * 60_000 && p.start >= event.start - 2 * 3600_000 && p.end > event.start
      && programmeMatchesEvent(event.title, p.title));
  return matches.length ? Math.max(...matches.map(p => p.end)) : undefined;
}