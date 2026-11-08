import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled real TV guide import (pg_cron, hourly, x-cron-secret).
 * Each run refreshes the stalest published guides the playlist needs (every feed ~6 hours).
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
        // Hourly run: refresh due guides one after another for up to ~35 s.
        const done: unknown[] = [];
        const until = Date.now() + 35_000;
        while (Date.now() < until) {
          const r = await importNextFeed();
          done.push(r);
          if ("skipped" in r) break;
        }
        return Response.json({ done });
      },
    },
  },
});
