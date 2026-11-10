import { createFileRoute } from "@tanstack/react-router";

// Retired: every customer now needs a website account and links their box through the Link Device page.
// Old one-off chat links get a clear "no longer used" answer.
export const Route = createFileRoute("/api/public/player-signin")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          { error: "This link is no longer used. Make a free account at bmsupport.uk and use the Link Device page." },
          { status: 410, headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
