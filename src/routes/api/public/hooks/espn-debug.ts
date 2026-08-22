import { createFileRoute } from "@tanstack/react-router";

async function probe(label: string, url: string, headers: Record<string, string> = {}) {
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const t = await r.text();
    return { label, status: r.status, len: t.length, snippet: t.slice(0, 160) };
  } catch (e) {
    return { label, error: e instanceof Error ? e.message : String(e) };
  }
}

export const Route = createFileRoute("/api/public/hooks/espn-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const event = new URL(request.url).searchParams.get("event") ?? "401880327";
        const summary = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/summary?event=${event}`;
        const results = await Promise.all([
          probe("site.api.direct", summary),
          probe(
            "site.web.api",
            `https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.2/summary?event=${event}`,
          ),
          probe("cdn.espn.core", `https://cdn.espn.com/soccer/match?gameId=${event}&xhr=1`),
          probe(
            "core.api",
            `https://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.2/events/${event}/competitions/${event}/competitors`,
          ),
          probe("allorigins", `https://api.allorigins.win/raw?url=${encodeURIComponent(summary)}`),
          probe("allorigins2", `https://api.allorigins.win/get?url=${encodeURIComponent(summary)}`),
          probe("corsproxy.io", `https://corsproxy.io/?url=${encodeURIComponent(summary)}`),
          probe("codetabs", `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(summary)}`),
          probe("thingproxy", `https://thingproxy.freeboard.io/fetch/${summary}`),
          probe("whateverorigin", `https://www.whateverorigin.org/get?url=${encodeURIComponent(summary)}`),
        ]);
        return Response.json(results, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
