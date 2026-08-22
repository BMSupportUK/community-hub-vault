import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { MatchDetailDTO } from "@/lib/boro-match-detail.types";

// FotMob is the single source for match detail. It is reachable from the
// production worker, so the popup updates live without relying on a visitor's
// browser relaying anything back.
const querySchema = z.object({
  home: z.string().min(2).max(80).nullable().optional(),
  away: z.string().min(2).max(80).nullable().optional(),
  kickoff: z.string().min(8).max(40).nullable().optional(),
  competition: z.string().max(80).nullable().optional(),
});

const emptyDetail = (): MatchDetailDTO => ({
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
});

export const Route = createFileRoute("/api/public/boro-match-detail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          home: url.searchParams.get("home"),
          away: url.searchParams.get("away"),
          kickoff: url.searchParams.get("kickoff"),
          competition: url.searchParams.get("competition"),
        });

        if (!parsed.success || !parsed.data.home || !parsed.data.away || !parsed.data.kickoff) {
          return Response.json({ error: "Invalid match" }, { status: 400 });
        }

        const noStore = {
          "cache-control": "no-store, no-cache, must-revalidate",
          pragma: "no-cache",
          expires: "0",
        };

        const { fetchFotmobSummary } = await import("@/lib/fotmob-boro.server");
        const fotmob = await fetchFotmobSummary({
          home: parsed.data.home,
          away: parsed.data.away,
          kickoff: parsed.data.kickoff,
        });

        if (!fotmob) {
          return Response.json({ ...emptyDetail(), eventId: "", slug: "fotmob" }, { headers: noStore });
        }

        const { normaliseBoroMatchDetail } = await import("@/lib/boro-match-detail-normalise");
        const detail = normaliseBoroMatchDetail(fotmob);

        return Response.json(
          { ...detail, eventId: String(fotmob?.header?.id ?? ""), slug: "fotmob" },
          { headers: noStore },
        );
      },
    },
  },
});
