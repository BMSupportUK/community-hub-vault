// Browser-assisted ESPN relay.
//
// ESPN blocks our server IPs (403), so the Fan Zone posts the raw Gamecast
// summary it fetched in the visitor's browser here. We validate it is a real
// Boro fixture payload, cache it, then refresh the match day forum thread so the
// live block, half-time and full-time replies keep updating.

import { createFileRoute } from "@tanstack/react-router";
import {
  putCachedEspnSummary,
  summaryHasCompetition,
  summaryMentionsBoro,
} from "@/lib/espn-summary-cache.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/espn-relay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }

        const eventId = String(body?.eventId ?? "").trim();
        const slug = String(body?.slug ?? "").trim() || "eng.2";
        const payload = body?.summary;
        if (!/^[0-9]{4,12}$/.test(eventId)) return json({ ok: false, error: "bad event id" }, 400);
        if (!/^[a-z0-9._]{3,24}$/.test(slug)) return json({ ok: false, error: "bad slug" }, 400);
        if (!summaryHasCompetition(payload)) return json({ ok: false, error: "no competition payload" }, 400);
        if (!summaryMentionsBoro(payload)) return json({ ok: false, error: "not a boro fixture" }, 400);

        const headerId = String(payload?.header?.id ?? "");
        if (headerId && headerId !== eventId) return json({ ok: false, error: "event id mismatch" }, 400);

        const kickoff = Date.parse(String(payload?.header?.competitions?.[0]?.date ?? ""));
        if (Number.isFinite(kickoff) && Math.abs(Date.now() - kickoff) > 7 * 24 * 60 * 60 * 1000) {
          return json({ ok: false, error: "fixture out of window" }, 400);
        }

        try {
          await putCachedEspnSummary({ eventId, slug, payload });
        } catch (error) {
          return json({ ok: false, error: (error as Error).message }, 500);
        }

        let thread: unknown = null;
        try {
          const { syncBoroMatchThread } = await import("@/lib/boro-match-thread.server");
          thread = await syncBoroMatchThread();
        } catch (error) {
          thread = { ok: false, error: (error as Error).message };
        }

        return json({ ok: true, thread });
      },
    },
  },
});
