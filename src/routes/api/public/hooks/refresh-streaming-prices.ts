import { createFileRoute } from "@tanstack/react-router";
import { refreshAllStreamingPrices } from "@/lib/streaming-prices.server";

// POST /api/public/hooks/refresh-streaming-prices
// Called weekly by pg_cron. Auth: CRON_SECRET in the `x-cron-secret` header.
export const Route = createFileRoute("/api/public/hooks/refresh-streaming-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await refreshAllStreamingPrices();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});