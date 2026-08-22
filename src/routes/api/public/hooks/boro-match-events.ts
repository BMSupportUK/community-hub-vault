import { createFileRoute } from "@tanstack/react-router";

async function run(ignoreWindow: boolean, rebuild = false) {
  const { syncBoroMatchEvents } = await import("@/lib/boro-match-events.server");
  try {
    return await syncBoroMatchEvents({ ignoreWindow, rebuild });
  } catch (e) {
    return { ok: false, posted: 0, updated: 0, skipped: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export const Route = createFileRoute("/api/public/hooks/boro-match-events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        return Response.json(await run(params.get("force") === "1", params.get("rebuild") === "1"));
      },
      POST: async () => Response.json(await run(false)),
    },
  },
});
