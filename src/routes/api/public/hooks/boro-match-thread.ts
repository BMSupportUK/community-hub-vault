import { createFileRoute } from "@tanstack/react-router";

async function run(ignoreWindow: boolean) {
  const { syncBoroMatchThread } = await import("@/lib/boro-match-thread.server");
  try {
    return await syncBoroMatchThread({ ignoreWindow });
  } catch (e) {
    return {
      ok: false,
      previewPosted: false,
      liveUpdated: false,
      halfTimePosted: false,
      skipped: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const Route = createFileRoute("/api/public/hooks/boro-match-thread")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        Response.json(await run(new URL(request.url).searchParams.get("force") === "1")),
      POST: async () => Response.json(await run(false)),
    },
  },
});