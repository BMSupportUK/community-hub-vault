import { createFileRoute } from "@tanstack/react-router";

// GET /:code — the shortest possible download address: bmsupport.uk/4839201
// Only a bare 7-digit path is treated as a download code; anything else
// falls through to a normal 404 so no page route is shadowed.
export const Route = createFileRoute("/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = params.code ?? "";
        if (!/^\d{7}$/.test(code)) {
          return new Response("Not found", { status: 404 });
        }
        const url = new URL(request.url);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${url.origin}/api/public/a/${code}`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
