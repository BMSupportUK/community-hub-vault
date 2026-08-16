import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const querySchema = z.object({
  eventId: z.string().regex(/^\d{1,24}$/),
  slug: z.string().regex(/^[a-z0-9._-]{1,32}$/).default("eng.2"),
});

export const Route = createFileRoute("/api/public/boro-match-detail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          eventId: url.searchParams.get("eventId"),
          slug: url.searchParams.get("slug") || "eng.2",
        });

        if (!parsed.success) {
          return Response.json({ error: "Invalid match" }, { status: 400 });
        }

        const { fetchBoroMatchDetail } = await import("@/lib/boro-match-detail.server");
        const detail = await fetchBoroMatchDetail(parsed.data.eventId, parsed.data.slug);

        return Response.json(detail, {
          headers: {
            "cache-control": "no-store, no-cache, must-revalidate",
            pragma: "no-cache",
            expires: "0",
          },
        });
      },
    },
  },
});