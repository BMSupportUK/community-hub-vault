import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled Sports Guide channel check (pg_cron, every 2 minutes, x-cron-secret).
 * Uses the separate CHANNEL_CHECK login so customers' viewing is never touched: opens up to
 * PER_RUN channels that are on or about to be on, one at a time, reads ~8 s and closes it.
 */
const PER_RUN = 5;
const SAMPLE_MS = 8000;
const MAX_BYTES = 4 * 1024 * 1024;

async function sample(url: string): Promise<{ busy: boolean; ok: boolean; why?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SAMPLE_MS + 4000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if ([401, 403, 429, 458, 503].includes(res.status)) return { busy: true, ok: false };
    if (!res.ok || !res.body) return { busy: false, ok: false, why: "Won't open" };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0; const until = Date.now() + SAMPLE_MS;
    while (Date.now() < until && size < MAX_BYTES) {
      const r = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), Math.max(1, until - Date.now())))]);
      if (!r || r.done) break;
      chunks.push(r.value); size += r.value.length;
    }
    void reader.cancel().catch(() => {});
    const buf = new Uint8Array(size); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
    const { tsVideoPackets, MIN_VIDEO_PACKETS } = await import("@/lib/player-channel-health");
    const video = tsVideoPackets(buf);
    if (video === null) return { busy: false, ok: false, why: size ? "Not a TV stream" : "No data" };
    return video >= MIN_VIDEO_PACKETS ? { busy: false, ok: true } : { busy: false, ok: false, why: "No picture" };
  } catch {
    return { busy: false, ok: false, why: "Won't open" };
  } finally { clearTimeout(timer); ctrl.abort(); }
}

export const Route = createFileRoute("/api/public/hooks/channel-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected || request.headers.get("x-cron-secret") !== expected) return new Response("Unauthorized", { status: 401 });
        const { channelCheckUrl, playlistStreamIds } = await import("@/lib/playlist-source.server");
        if (!(await channelCheckUrl("0"))) return Response.json({ skipped: "No channel-check login saved" });
        const { buildSportsFeed } = await import("@/lib/player-sports-feed.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = Date.now();
        const feed = await buildSportsFeed();
        const live = feed.events.filter((e) => e.start <= now + 30 * 60_000 && (e.end ?? e.start + 3 * 3600_000) >= now);
        const names = [...new Set(live.flatMap((e) => e.channels))];
        if (!names.length) return Response.json({ checked: 0 });
        const ids = await playlistStreamIds(names);
        const { data: rows } = await supabaseAdmin.from("player_channel_health").select("channel_key, last_checked_at, problem_source")
          .in("channel_key", names.map((n) => n.toLowerCase()).slice(0, 500));
        const seen = new Map((rows ?? []).map((r) => [r.channel_key, r]));
        const queue = names.filter((n) => ids.has(n.toLowerCase()))
          .sort((a, b) => Date.parse(seen.get(a.toLowerCase())?.last_checked_at ?? "1970") - Date.parse(seen.get(b.toLowerCase())?.last_checked_at ?? "1970"))
          .slice(0, PER_RUN);
        const results: { name: string; ok: boolean; why?: string }[] = [];
        for (const name of queue) {
          const key = name.toLowerCase();
          const url = await channelCheckUrl(ids.get(key)!);
          if (!url) break;
          const r = await sample(url);
          if (r.busy) { results.push({ name, ok: false, why: "Check login busy" }); break; }
          const nowIso = new Date().toISOString();
          const prev = seen.get(key);
          const patch = r.ok
            // A passing check only clears its own earlier failure; player black-screen reports wait for a clean play.
            ? { last_checked_at: nowIso, ...(prev?.problem_source === "check" ? { last_ok_at: nowIso } : {}) }
            : { last_checked_at: nowIso, problem: r.why ?? "Won't open", problem_source: "check", last_problem_at: nowIso };
          await supabaseAdmin.from("player_channel_health").upsert({ channel_key: key, channel_name: name, updated_at: nowIso, ...patch });
          results.push({ name, ok: r.ok, why: r.why });
        }
        return Response.json({ checked: results.length, results });
      },
    },
  },
});
