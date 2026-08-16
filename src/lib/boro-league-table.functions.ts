import { createServerFn } from "@tanstack/react-start";
import type { FullLeagueRow } from "@/lib/boro-league-table.server";

export type { FullLeagueRow };

export const getBoroFullLeagueTable = createServerFn({ method: "GET" }).handler(
  async (): Promise<FullLeagueRow[]> => {
    const { fetchFullStandings } = await import("@/lib/boro-league-table.server");
    try {
      return await fetchFullStandings();
    } catch {
      return [];
    }
  },
);
