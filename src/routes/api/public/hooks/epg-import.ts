import { createFileRoute } from "@tanstack/react-router";

/**
 * Retired country guide import. No downloads or database work are performed.
 */
export const Route = createFileRoute("/api/public/hooks/epg-import")({
  server: {
    handlers: {
      POST: () => new Response('Country EPG retired', { status: 410 }),
    },
  },
});
