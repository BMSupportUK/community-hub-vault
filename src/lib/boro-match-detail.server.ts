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
    const { espnJson } = await import("@/lib/espn-fetch");
    const json: any = await espnJson(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(eventId)}`,
    );
    if (!json) return empty;

    return normaliseBoroMatchDetail(json);
  } catch (error) {
    console.error("[boro-match-detail] fetch failed", error);
    return empty;
  }
}