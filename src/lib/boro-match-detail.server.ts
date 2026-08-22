import {
  normaliseBoroMatchDetail,
} from "@/lib/boro-match-detail-normalise";
import type { MatchDetailDTO } from "@/lib/boro-match-detail.types";

export async function fetchBoroMatchDetail(eventId: string, slug: string): Promise<MatchDetailDTO> {
  const empty: MatchDetailDTO = {
    available: false,
    status: null,
    clock: null,
    homeTeamId: null,
    awayTeamId: null,
    home: null,
    away: null,
    events: [],
    shootout: [],
    teamStats: [],
    lineups: [],
    source: "none",
    fetchedAt: new Date().toISOString(),
  };

  try {
    // FotMob only — ESPN is no longer used as a fallback.
    if (slug !== "fotmob") return empty; // ESPN ids are no longer resolvable — FotMob only.
    const { fetchFotmobSummary } = await import("@/lib/fotmob-boro.server");
    const json: any = await fetchFotmobSummary({
      home: "",
      away: "",
      kickoff: new Date().toISOString(),
      matchId: eventId,
    });
    if (!json) return empty;
    return normaliseBoroMatchDetail(json);
  } catch (error) {
    console.error("[boro-match-detail] fetch failed", error);
    return empty;
  }
}