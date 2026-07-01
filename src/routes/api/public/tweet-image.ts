import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = new Set(["pbs.twimg.com", "ton.twimg.com", "video.twimg.com"]);
const MAX_BYTES = 8 * 1024 * 1024;

export const Route = createFileRoute("/api/public/tweet-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("url") ?? "";
        let src: URL;
        try {
          src = new URL(raw);
        } catch {
          return new Response("Bad image URL", { status: 400 });
        }

        if (src.protocol !== "https:" || !ALLOWED_HOSTS.has(src.hostname)) {
          return new Response("Forbidden", { status: 403 });
        }

        const res = await fetch(src, {
          headers: {
            accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "user-agent": "Mozilla/5.0",
          },
        });
        if (!res.ok) return new Response("Image unavailable", { status: 502 });

        const length = Number(res.headers.get("content-length") ?? "0");
        if (length > MAX_BYTES) return new Response("Image too large", { status: 413 });

        return new Response(res.body, {
          status: 200,
          headers: {
            "content-type": res.headers.get("content-type") ?? "image/jpeg",
            "cache-control": "public, max-age=604800, stale-while-revalidate=86400",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});