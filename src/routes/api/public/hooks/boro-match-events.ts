import { createFileRoute } from "@tanstack/react-router";

async function run(ignoreWindow: boolean) {
  const { syncBoroMatchEvents } = await import("@/lib/boro-match-events.server");
  try {
    return await syncBoroMatchEvents({ ignoreWindow });
  } catch (e) {
    return { ok: false, posted: 0, updated: 0, skipped: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export const Route = createFileRoute("/api/public/hooks/boro-match-events")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        Response.json(await run(new URL(request.url).searchParams.get("force") === "1")),
      POST: async () => Response.json(await run(false)),
    },
  },
});
