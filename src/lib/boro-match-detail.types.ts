import type { EspnMatchEvent } from "@/lib/boro-espn-events";

export type MatchEventItem = EspnMatchEvent;

export type TeamStatLine = {
  name: string;
  label: string;
  home: string;
  away: string;
  primary: boolean;
};

export type PlayerLine = {
  id: string;
  name: string;
  jersey: string | null;
  position: string | null;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  stats: Record<string, string>;
};

export type TeamLineup = {
  teamId: string | null;
  team: string;
  logo: string | null;
  formation: string | null;
  players: PlayerLine[];
};

export type MatchDetailDTO = {
  available: boolean;
  status: string | null;
  clock: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  home: string | null;
  away: string | null;
  events: MatchEventItem[];
  shootout: MatchEventItem[];
  teamStats: TeamStatLine[];
  lineups: TeamLineup[];
  /** True only when the provider publishes the actual confirmed team sheet. */
  lineupsConfirmed?: boolean;
  source: string;
  fetchedAt: string;
};