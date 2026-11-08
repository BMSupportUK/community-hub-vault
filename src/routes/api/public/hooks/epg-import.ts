import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled real TV guide import (pg_cron, hourly, x-cron-secret).
 * Legacy scheduler dispatches demand only; explicit secret-verified diagnostic imports remain available.
 */
export const Route = createFileRoute("/api/public/hooks/epg-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected || request.headers.get("x-cron-secret") !== expected) return new Response("Unauthorized", { status: 401 });
        const { importNextFeed, importFeed } = await import("@/lib/real-epg.server");
        let feed: string | undefined;
        try { const b = (await request.json()) as { feed?: unknown }; if (typeof b.feed === "string" && /^[A-Z0-9_]{2,20}$/.test(b.feed)) feed = b.feed; } catch { /* empty body */ }
        if (feed) return Response.json(await importFeed(feed));
        return Response.json(await importNextFeed());
      },
    },
  },
});
