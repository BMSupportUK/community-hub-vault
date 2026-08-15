import { createFileRoute } from "@tanstack/react-router";

async function probe(url: string, headers: Record<string, string>) {
  try {
    const r = await fetch(url, { headers });
    const t = await r.text();
    return { url, status: r.status, len: t.length, snippet: t.slice(0, 200) };
  } catch (e) {
    return { url, error: e instanceof Error ? e.message : String(e) };
  }
}

export const Route = createFileRoute("/api/public/hooks/espn-debug")({
  server: {
    handlers: {
      GET: async () =>
        Response.json([
          await probe(
            "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/scoreboard?dates=20260815&limit=200",
            { accept: "application/json" },
          ),
          await probe(
            "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/scoreboard?dates=20260815&limit=200",
            {
              accept: "application/json",
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            },
          ),
        ]),
    },
  },
});
