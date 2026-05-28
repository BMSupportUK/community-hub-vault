import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/link-preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("url") ?? "";
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return json({ error: "Invalid url" }, 400);
        }
        if (!/^https?:$/i.test(target.protocol)) {
          return json({ error: "Unsupported protocol" }, 400);
        }

        try {
          const res = await fetch(target.toString(), {
            redirect: "follow",
            headers: {
              "user-agent":
                "Mozilla/5.0 (compatible; BMSupportLinkPreview/1.0; +https://bmsupport.uk)",
              accept: "text/html,application/xhtml+xml",
            },
            signal: AbortSignal.timeout(6000),
          });
          const ct = res.headers.get("content-type") ?? "";
          if (!res.ok || !ct.includes("text/html")) {
            return json(
              { host: target.hostname.replace(/^www\./, ""), title: null, description: null, image: null },
              200,
            );
          }
          // Read at most ~256KB of HTML to find <head> metadata.
          const reader = res.body?.getReader();
          let html = "";
          if (reader) {
            const decoder = new TextDecoder();
            let total = 0;
            while (total < 262144) {
              const { value, done } = await reader.read();
              if (done) break;
              total += value.byteLength;
              html += decoder.decode(value, { stream: true });
              if (/<\/head>/i.test(html)) break;
            }
            try { await reader.cancel(); } catch { /* ignore */ }
          } else {
            html = await res.text();
          }

          const meta = (name: string) => {
            const re = new RegExp(
              `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
              "i",
            );
            const re2 = new RegExp(
              `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
              "i",
            );
            return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null;
          };

          const title =
            meta("og:title") ??
            meta("twitter:title") ??
            html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
            null;
          const description = meta("og:description") ?? meta("twitter:description") ?? meta("description");
          let image = meta("og:image") ?? meta("twitter:image") ?? null;
          if (image) {
            try { image = new URL(image, target).toString(); } catch { /* keep raw */ }
          }

          return json(
            {
              host: target.hostname.replace(/^www\./, ""),
              title: title ? decode(title).slice(0, 240) : null,
              description: description ? decode(description).slice(0, 400) : null,
              image,
            },
            200,
          );
        } catch {
          return json(
            { host: target.hostname.replace(/^www\./, ""), title: null, description: null, image: null },
            200,
          );
        }
      },
    },
  },
});

function decode(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}