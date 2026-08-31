import { createFileRoute } from "@tanstack/react-router";

// GET /a/:token — short, remote-friendly alias that redirects to the
// authenticated-free download endpoint. Keeps the URL short enough to type
// into the Downloader app on a Fire Stick.
export const Route = createFileRoute("/a/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = encodeURIComponent((params.token ?? "").toUpperCase());
        const url = new URL(request.url);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${url.origin}/api/public/a/${token}`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
