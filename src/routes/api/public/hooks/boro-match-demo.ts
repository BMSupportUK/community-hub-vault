import { createFileRoute } from "@tanstack/react-router";

async function run(url: URL) {
  const topicId = url.searchParams.get("topic") ?? undefined;
  const clear = url.searchParams.get("clear") === "1";
  const mod = await import("@/lib/boro-match-demo.server");
  try {
    return clear ? await mod.clearBoroDemoPosts(topicId) : await mod.postBoroDemoPosts(topicId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const Route = createFileRoute("/api/public/hooks/boro-match-demo")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json(await run(new URL(request.url))),
      POST: async ({ request }) => Response.json(await run(new URL(request.url))),
    },
  },
});
