import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/fantasy-lineup-swaps")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { syncLineupSwaps } = await import("@/lib/fantasy-lineup-swap.server");
        return Response.json(await syncLineupSwaps());
      },
    },
  },
});