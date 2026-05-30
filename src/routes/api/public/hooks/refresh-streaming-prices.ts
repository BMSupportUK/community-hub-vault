import { createFileRoute } from "@tanstack/react-router";
import { refreshAllStreamingPrices } from "@/lib/streaming-prices.server";

// POST /api/public/hooks/refresh-streaming-prices
// Called weekly by pg_cron with `apikey` header set to the project anon key.
export const Route = createFileRoute("/api/public/hooks/refresh-streaming-prices")({
  server: {
    handlers: {
      POST: async () => {
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