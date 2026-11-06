import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The iPhone/iPad web player is a BM Player device owned by the signed-in member.
 * It reuses the browser's existing device token when it is still theirs, otherwise links a new one,
 * so unlock, favourites, votes, progress and announcements all go through the normal device endpoint.
 */
export const webPlayerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{64}$/).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.token) {
      const { data: row } = await supabaseAdmin.from("player_devices").select("id, user_id, platform")
        .eq("token_hash", await sha256Hex(data.token)).maybeSingle();
      if (row && row.user_id === context.userId && row.platform === "web") return { token: data.token };
    }
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabaseAdmin.from("player_devices").insert({
      token_hash: await sha256Hex(token), platform: "web", name: "iPhone / iPad browser",
      user_id: context.userId, linked_at: new Date().toISOString(),
    });
    if (error) throw new Error("Couldn't start BM Player. Try again.");
    return { token };
  });

const ProviderCall = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["get_live_categories", "get_vod_categories", "get_series_categories", "get_live_streams", "get_vod_streams", "get_series"]) }),
  z.object({ action: z.literal("get_series_info"), series_id: z.string().regex(/^\d{1,12}$/) }),
  z.object({ action: z.literal("get_short_epg"), stream_id: z.string().regex(/^\d{1,12}$/) }),
  z.object({ action: z.literal("get_simple_data_table"), stream_id: z.string().regex(/^\d{1,12}$/) }),
]);

function decode(v: unknown) {
  const s = String(v ?? "");
  try {
    const bin = atob(s);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return text;
  } catch { return s; }
}
type Row = Record<string, unknown>;
const programmes = (rows: Row[]) => rows.map((p) => ({
  id: String(p.id ?? p.start_timestamp), title: decode(p.title), desc: decode(p.description),
  start: Number(p.start_timestamp) * 1000, end: Number(p.stop_timestamp ?? p.end_timestamp) * 1000,
  archive: "has_archive" in p ? Number(p.has_archive) === 1 : true,
})).filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start);

/**
 * Lists, guide and series details for one of the member's own saved app logins, fetched server-side
 * (provider panels don't allow browser requests). Results are trimmed to what the player shows;
 * films/episodes Safari can't play are dropped here so they never appear.
 */
export const webPlayerProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ credentialId: z.string().uuid(), call: ProviderCall }).parse(d))
  .handler(async ({ data, context }) => {
    const { playableVod } = await import("@/lib/player-web");
    const { data: cred } = await context.supabase.from("app_credentials").select("app_login_name, password, owner_id")
      .eq("id", data.credentialId).maybeSingle();
    if (!cred || cred.owner_id !== context.userId || !cred.app_login_name || !cred.password) throw new Error("That app login isn't on your account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin.from("player_settings").select("dns, maintenance_enabled, maintenance_message").eq("id", 1).maybeSingle();
    if (settings?.maintenance_enabled) throw new Error(settings.maintenance_message || "BM Player is down for maintenance. Please try again soon.");
    const dns = (settings?.dns ?? "").replace(/\/+$/, "");
    if (!dns) throw new Error("BM Player isn't set up yet.");
    const q = new URLSearchParams({ username: cred.app_login_name, password: cred.password, action: data.call.action });
    if ("series_id" in data.call) q.set("series_id", data.call.series_id);
    if ("stream_id" in data.call) q.set("stream_id", data.call.stream_id);
    if (data.call.action === "get_short_epg") q.set("limit", "40");
    let raw: unknown;
    try {
      const r = await fetch(`${dns}/player_api.php?${q}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(String(r.status));
      raw = await r.json();
    } catch { throw new Error("Couldn't reach the TV service. Try again in a moment."); }
    const rows = (Array.isArray(raw) ? raw : []) as Row[];
    const a = data.call.action;
    if (a.endsWith("_categories")) return { categories: rows.map((c) => ({ id: String(c.category_id), name: String(c.category_name ?? "") })) };
    if (a === "get_live_streams") return { items: rows.map((p) => ({
      kind: "live" as const, id: String(p.stream_id), name: String(p.name ?? "Untitled"), category: String(p.category_id ?? ""),
      poster: String(p.stream_icon ?? ""), archive: Number(p.tv_archive) === 1 ? Math.max(1, Number(p.tv_archive_duration) || 1) : 0,
    })) };
    if (a === "get_vod_streams") return { items: rows.filter((p) => playableVod(String(p.container_extension ?? ""))).map((p) => ({
      kind: "film" as const, id: String(p.stream_id), name: String(p.name ?? "Untitled"), category: String(p.category_id ?? ""),
      poster: String(p.stream_icon ?? ""), ext: String(p.container_extension).toLowerCase(), added: Number(p.added) || 0, rating: Number(p.rating_5based ?? p.rating) || 0,
    })) };
    if (a === "get_series") return { items: rows.map((p) => ({
      kind: "series" as const, id: String(p.series_id), name: String(p.name ?? "Untitled"), category: String(p.category_id ?? ""),
      poster: String(p.cover ?? ""), added: Number(p.last_modified) || 0, rating: Number(p.rating_5based ?? p.rating) || 0,
    })) };
    if (a === "get_series_info") {
      const info = (raw ?? {}) as { info?: Row; episodes?: Record<string, Row[]> };
      const seasons: Record<string, { id: string; title: string; num: number; ext: string; plot: string }[]> = {};
      for (const [season, eps] of Object.entries(info.episodes ?? {})) {
        const ok = (eps ?? []).filter((e) => playableVod(String(e.container_extension ?? ""))).map((e) => ({
          id: String(e.id), title: String(e.title ?? `Episode ${e.episode_num}`), num: Number(e.episode_num) || 0,
          ext: String(e.container_extension).toLowerCase(), plot: String((e.info as Row | undefined)?.plot ?? ""),
        }));
        if (ok.length) seasons[season] = ok; // a season with nothing playable doesn't show
      }
      return { plot: String(info.info?.plot ?? ""), backdrop: String((info.info?.backdrop_path as string[] | undefined)?.[0] ?? info.info?.cover ?? ""), seasons };
    }
    const listings = ((raw as { epg_listings?: Row[] })?.epg_listings ?? []) as Row[];
    return { programmes: programmes(listings) };
  });

/** Provider address for building play links in Safari; only ever given to signed-in members. */
export const webPlayerDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("player_settings").select("dns").eq("id", 1).maybeSingle();
    return { dns: (data?.dns ?? "").replace(/\/+$/, "") };
  });
