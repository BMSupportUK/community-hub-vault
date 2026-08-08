import { createFileRoute } from "@tanstack/react-router";

async function run() {
  const { syncFantasyScoring } = await import("@/lib/fantasy-live-stats.server");
  return await syncFantasyScoring();
}

export const Route = createFileRoute("/api/public/hooks/sync-fantasy-scores")({
  server: {
    handlers: {
      GET: async () => Response.json(await run()),
      POST: async () => Response.json(await run()),
    },
  },
});
