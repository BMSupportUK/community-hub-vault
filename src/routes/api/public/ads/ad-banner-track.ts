import { createFileRoute } from "@tanstack/react-router";

/**
 * Bait endpoint for ad-blocker detection. The path deliberately matches
 * patterns common filter lists block, so a blocked request tells us an
 * ad blocker is active. It serves no tracking and stores nothing.
 */
export const Route = createFileRoute("/api/public/ads/ad-banner-track")({
  server: {
    handlers: {
      GET: () =>
        new Response("/* bm-ads-ok */", {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
