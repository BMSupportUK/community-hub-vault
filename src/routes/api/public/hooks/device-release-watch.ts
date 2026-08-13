import { createFileRoute } from "@tanstack/react-router";
import { watchForDeviceReleases } from "@/lib/device-release-watch.server";

// POST /api/public/hooks/device-release-watch
// Called weekly by pg_cron with `apikey` header set to the project anon key.
export const Route = createFileRoute("/api/public/hooks/device-release-watch")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await watchForDeviceReleases();
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
