import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled Sports Guide channel check (pg_cron, every 2 minutes, x-cron-secret).
 * Uses the separate CHANNEL_CHECK login only for channels a player reported in the last 15 min
 * (and not yet checked since), one at a time, ~8 s each. No reports = no provider requests.
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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Only test channels a player has just reported, so the check login never hammers the provider.
        const since = new Date(Date.now() - 15 * 60_000).toISOString();
        const { data: rows } = await supabaseAdmin.from("player_channel_health").select("channel_key, channel_name, last_checked_at, last_problem_at, last_ok_at, problem_source")
          .gte("last_problem_at", since).neq("problem_source", "check").order("last_problem_at", { ascending: false }).limit(50);
        const reported = (rows ?? []).filter((r) => (!r.last_ok_at || r.last_ok_at < r.last_problem_at!) && (!r.last_checked_at || r.last_checked_at < r.last_problem_at!));
        if (!reported.length) return Response.json({ checked: 0 });
        const seen = new Map(reported.map((r) => [r.channel_key, r]));
        const ids = await playlistStreamIds(reported.map((r) => r.channel_name));
        const queue = reported.map((r) => r.channel_name).filter((n) => ids.has(n.toLowerCase())).slice(0, PER_RUN);
        const results: { name: string; ok: boolean; why?: string }[] = [];
        for (const name of queue) {
          const key = name.toLowerCase();
          const url = await channelCheckUrl(ids.get(key)!);
          if (!url) break;
          const r = await sample(url);
          if (r.busy) { results.push({ name, ok: false, why: "Check login busy" }); break; }
          const nowIso = new Date().toISOString();
          void seen;
          const patch = r.ok
            // A passing check confirms the reported channel is back.
            ? { last_checked_at: nowIso, last_ok_at: nowIso }
            : { last_checked_at: nowIso, problem: r.why ?? "Won't open", problem_source: "check", last_problem_at: nowIso };
          await supabaseAdmin.from("player_channel_health").upsert({ channel_key: key, channel_name: name, updated_at: nowIso, ...patch });
          results.push({ name, ok: r.ok, why: r.why });
        }
        return Response.json({ checked: results.length, results });
      },
    },
  },
});
