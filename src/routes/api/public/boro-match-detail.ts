import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const normaliseTeam = (value: string | null) =>
  (value ?? "").toLowerCase().replace(/[^a-z]/g, "").replace(/footballclub$/, "").replace(/fc$/, "");

const teamsMatch = (actual: string | null, expected: string | null | undefined) => {
  const left = normaliseTeam(actual);
  const right = normaliseTeam(expected ?? null);
  return !!left && !!right && (left.includes(right) || right.includes(left));
};

// Either an explicit ESPN event id, or the fixture itself (teams + kick-off) so
// the endpoint can resolve the id on its own when the match centre hasn't got
// one cached.
const querySchema = z.object({
  eventId: z.string().regex(/^\d{1,24}$/).nullable().optional(),
  slug: z.string().regex(/^[a-z0-9._-]{1,32}$/).default("eng.2"),
  home: z.string().min(2).max(80).nullable().optional(),
  away: z.string().min(2).max(80).nullable().optional(),
  kickoff: z.string().min(8).max(40).nullable().optional(),
  competition: z.string().max(80).nullable().optional(),
});

export const Route = createFileRoute("/api/public/boro-match-detail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          eventId: url.searchParams.get("eventId"),
          slug: url.searchParams.get("slug") || "eng.2",
          home: url.searchParams.get("home"),
          away: url.searchParams.get("away"),
          kickoff: url.searchParams.get("kickoff"),
          competition: url.searchParams.get("competition"),
        });

        if (!parsed.success) {
          return Response.json({ error: "Invalid match" }, { status: 400 });
        }

        let eventId = parsed.data.eventId ?? null;
        let slug = parsed.data.slug;

        const { fetchBoroMatchDetail } = await import("@/lib/boro-match-detail.server");

        // FotMob is reachable from the production worker and does not rely on
        // a visitor relaying data. Prefer it whenever the fixture is known.
        if (parsed.data.home && parsed.data.away && parsed.data.kickoff) {
          const { fetchFotmobSummary } = await import("@/lib/fotmob-boro.server");
          const fotmob = await fetchFotmobSummary({
            home: parsed.data.home,
            away: parsed.data.away,
            kickoff: parsed.data.kickoff,
          });
          if (fotmob) {
            const { normaliseBoroMatchDetail } = await import("@/lib/boro-match-detail-normalise");
            const detail = normaliseBoroMatchDetail(fotmob);
            return Response.json(
              { ...detail, eventId: String(fotmob?.header?.id ?? eventId ?? ""), slug: "fotmob" },
              { headers: { "cache-control": "no-store, no-cache, must-revalidate" } },
            );
          }
        }

        // A known event id is the fastest path. Its response is also checked
        // against the fixture, so a stale id can never display another match.
        if (eventId) {
          const direct = await fetchBoroMatchDetail(eventId, slug);
          const fixtureMatches =
            parsed.data.home && parsed.data.away
              ? teamsMatch(direct.home, parsed.data.home) && teamsMatch(direct.away, parsed.data.away)
              : true;
          if (fixtureMatches && (direct.home || direct.away || direct.available)) {
            return Response.json({ ...direct, eventId, slug }, {
              headers: { "cache-control": "private, max-age=10, stale-while-revalidate=20" },
            });
          }
        }

        // Only search the scoreboards when the id is absent, stale, or failed.
        if (parsed.data.home && parsed.data.away && parsed.data.kickoff) {
          const { resolveEspnEvent } = await import("@/lib/boro-espn-resolve.server");
          const resolved = await resolveEspnEvent({
            home: parsed.data.home,
            away: parsed.data.away,
            kickoff: parsed.data.kickoff,
            competition: parsed.data.competition ?? null,
          });
          if (resolved) {
            eventId = resolved.eventId;
            slug = resolved.slug;
          }
        }

        if (!eventId) {
          return Response.json({ error: "Invalid match" }, { status: 400 });
        }

        const detail = { ...(await fetchBoroMatchDetail(eventId, slug)), eventId, slug };

        let diag: unknown = undefined;
        if (url.searchParams.get("debug") === "1") {
          const target = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${encodeURIComponent(eventId)}`;
          try {
            const upstream = await fetch(target, { headers: { accept: "application/json" } });
            const body = await upstream.text();
            diag = { status: upstream.status, bytes: body.length, sample: body.slice(0, 200) };
          } catch (error) {
            diag = { error: String(error) };
          }
        }

        return Response.json(diag ? { ...detail, diag } : detail, {
          headers: {
            "cache-control": "no-store, no-cache, must-revalidate",
            pragma: "no-cache",
            expires: "0",
          },
        });
      },
    },
  },
});