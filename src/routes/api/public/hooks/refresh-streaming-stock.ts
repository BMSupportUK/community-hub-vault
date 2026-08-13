import { createFileRoute } from "@tanstack/react-router";
import { refreshAllStreamingStock } from "@/lib/streaming-prices.server";

// POST /api/public/hooks/refresh-streaming-stock
// Called every 10 minutes by pg_cron with `apikey` header set to the project
// anon key. Availability only — prices are refreshed on their own schedule.
export const Route = createFileRoute("/api/public/hooks/refresh-streaming-stock")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await refreshAllStreamingStock();
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