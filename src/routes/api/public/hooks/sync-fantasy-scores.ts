import { createFileRoute } from "@tanstack/react-router";

async function run() {
  const { syncFantasyScoring } = await import("@/lib/fantasy-live-stats.server");
  return await syncFantasyScoring();
}

// Scheduled job only: callers must present the shared cron secret.
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  return Boolean(expected && provided && provided === expected);
}
const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export const Route = createFileRoute("/api/public/hooks/sync-fantasy-scores")({
  server: {
    handlers: {
      GET: async ({ request }) => (authorized(request) ? Response.json(await run()) : unauthorized()),
      POST: async ({ request }) => (authorized(request) ? Response.json(await run()) : unauthorized()),
    },
  },
});
