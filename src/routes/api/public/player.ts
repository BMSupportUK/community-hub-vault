import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
const APPROVAL_REQUESTS_RETIRED = true;
import { LINK_CODE_TTL_MS, PENDING_CREDENTIAL_TTL_MS } from "@/lib/player-link";
import { checkinSlowdown } from "@/lib/player-checkin";
import { createSharedCache } from "@/lib/player-sports-cache";
import { RatingTitle, RatingVote, ratingIdentity, ratingVoter } from "@/lib/player-ratings";
import { announcementReachesDevice } from "@/lib/player-announcement-audience";
import { WATCH_REQUEST_TTL_MS } from "@/lib/send-to-box";
import { ALERT_COOLDOWN_MS, ALERT_WINDOW_MS, BufferBatch, eventTime, stallCause, shouldAlert } from "@/lib/player-buffering";

// One sports-guide build per minute per server instance, however many apps ask.
const sportsCache = createSharedCache<{ version: string; events: unknown[]; aliases: unknown[] }>(60_000);

/**
 * Endpoint for the BM Player apps (TV, phone, Windows). Apps have no website
 * account; after "register" every call proves itself with the device token
 * (stored only as a hash). Logins are handed over once and then deleted.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const Token = z.string().regex(/^[0-9a-f]{64}$/);
/** A saved favourite as the apps store it; extra display fields pass through but each item stays small. */
const FavouriteItem = z.object({
  kind: z.string().trim().min(1).max(20),
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().max(300).optional(),
}).passthrough().refine(item => JSON.stringify(item).length <= 4000);
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    platform: z.enum(["android", "firetv", "phone", "windows", "mac"]),
    name: z.string().trim().min(1).max(60).optional(),
  }),
  z.object({ action: z.literal("code"), device_token: Token }),
  z.object({
    action: z.literal("poll"), device_token: Token,
    login: z.string().trim().max(120).optional(),
    version: z.string().trim().max(20).optional(),
    sig: z.string().trim().max(128).optional(),
    watching: z.object({
      kind: z.string().transform((k) => k === "episode" ? "series" : k === "movie" ? "film" : ["live", "film", "series", "catchup"].includes(k) ? k : "live"),
      title: z.string().trim().max(200),
      category: z.string().trim().max(120).optional(),
      player: z.string().trim().max(20).optional(),
      since: z.number().int().positive(),
    }).nullish(),
  }),
  z.object({ action: z.literal("unlink"), device_token: Token }),
  z.object({ action: z.literal("unlock"), device_token: Token, account_number: z.string().trim().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("unlock_status"), device_token: Token }),
  z.object({ action: z.literal("pin_status"), device_token: Token }),
  z.object({ action: z.literal("signin_chat"), device_token: Token }),
  z.object({ action: z.literal("signin_code"), device_token: Token, code: z.string().trim().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("totp_start"), device_token: Token }),
  z.object({ action: z.literal("totp_reset_request"), device_token: Token }),
  z.object({ action: z.literal("totp_confirm"), device_token: Token, code: z.string().trim().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("pin_create"), device_token: Token, pin: z.string().trim().regex(/^\d{4}$/) }),
  z.object({ action: z.literal("pin_check"), device_token: Token, pin: z.string().trim().regex(/^(\d{4}|\d{6}|\d{4}[- ]?\d{4})$/) }),
  z.object({ action: z.literal("sports"), device_token: Token }),
  z.object({ action: z.literal("guide"), device_token: Token, channel: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal('guide_category_open'), device_token: Token, category: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("announcement"), device_token: Token }),
  z.object({
    action: z.literal("stream_claim"), device_token: Token,
    login: z.string().trim().min(1).max(120), max: z.number().int().min(1).max(100),
    takeover: z.boolean().optional(), screens: z.number().int().min(1).max(3).optional(),
    kind: z.enum(["live", "film", "series", "catchup"]), title: z.string().trim().min(1).max(200),
  }),
  z.object({ action: z.literal("stream_release"), device_token: Token }),
  z.object({ action: z.literal("rooms"), device_token: Token, login: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("subtitle_check"), device_token: Token, name: z.string().trim().min(1).max(200), tracks: z.number().int().min(0).max(50), languages: z.string().max(200).optional() }),
  z.object({ action: z.literal("channel_health"), device_token: Token, name: z.string().trim().min(1).max(200), status: z.enum(["failed", "black", "ok"]) }),
  z.object({ action: z.literal("formats"), device_token: Token }),
  z.object({ action: z.literal("format_set"), device_token: Token, content_id: z.string().regex(/^[A-Za-z0-9._-]{1,80}$/), fmt: z.enum(["ts", "m3u8"]) }),
  z.object({ action: z.literal("major_announcements"), device_token: Token }),
  z.object({ action: z.literal("ratings"), device_token: Token, items: z.array(RatingTitle).min(1).max(200) }),
  RatingVote.extend({ action: z.literal("vote"), device_token: Token }),
  z.object({ action: z.literal("favourites"), device_token: Token, login: z.string().trim().min(1).max(120) }),
  z.object({
    action: z.literal("favourites_set"), device_token: Token, login: z.string().trim().min(1).max(120),
    items: z.array(FavouriteItem).max(500),
  }),
  z.object({ action: z.literal("progress"), device_token: Token, login: z.string().trim().min(1).max(120) }),
  z.object({
    action: z.literal("progress_set"), device_token: Token, login: z.string().trim().min(1).max(120),
    items: z.array(z.object({
      key: z.string().regex(/^(film|episode|series):[A-Za-z0-9._-]{1,80}$/),
      position_ms: z.number().int().min(0).max(1e9), duration_ms: z.number().int().min(0).max(1e9),
      updated_at: z.number().int().min(0),
      // How long ago (on the device's own clock) it was watched; makes "last device wins" immune to wrong device clocks.
      age_ms: z.number().int().min(0).max(1e11).optional(),
    })).min(1).max(50),
  }),
  z.object({
    action: z.literal("voice"), device_token: Token,
    mime: z.enum(["audio/wav", "audio/webm"]),
    audio: z.string().min(100).max(1_700_000).regex(/^[A-Za-z0-9+/=]+$/),
  }),
  z.object({
    action: z.literal("connection_alert"), device_token: Token,
    active: z.number().int().min(0).max(100),
    max: z.number().int().min(1).max(100),
    exceeded_since: z.number().int().positive(),
    login: z.string().trim().max(120).optional(),
    version: z.string().trim().max(20).optional(),
  }),
  z.object({ action: z.literal("buffering"), device_token: Token, version: z.string().trim().max(20).optional(), events: BufferBatch }),
  z.object({
    action: z.literal("report"), device_token: Token,
    kind: z.enum(["live", "film", "series"]),
    title: z.string().trim().min(1).max(200),
    category: z.string().trim().max(120).optional(),
    episode: z.string().trim().max(200).optional(),
    issue: z.string().trim().min(3).max(1000),
    device: z.string().trim().max(80).optional(),
    version: z.string().trim().max(20).optional(),
  }),
]);

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}
const ANNOUNCEMENT_WINDOW_MS = 3 * 60_000;
let announcementCache: { at: number; value: { id: string; message: string; sent_at: number; target_user_id: string | null; target_device_id: string | null } | null } | null = null;
async function currentAnnouncement(admin: { from: (t: "player_announcements") => any }) {
  if (announcementCache && Date.now() - announcementCache.at < 10_000) return announcementCache.value;
  const { data, error } = await admin.from("player_announcements").select("id, message, created_at, target_user_id, target_device_id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return announcementCache?.value ?? null;
  let row = data;
  // One-off: delivered to players open in the first few minutes, then ended so it is never sent again.
  if (row && Date.now() - Date.parse(row.created_at) > ANNOUNCEMENT_WINDOW_MS) {
    await admin.from("player_announcements").update({ active: false, ended_at: new Date().toISOString() }).eq("id", row.id);
    row = null;
  }
  announcementCache = { at: Date.now(), value: row ? { id: row.id, message: row.message, sent_at: Date.parse(row.created_at), target_user_id: row.target_user_id, target_device_id: row.target_device_id ?? null } : null };
  return announcementCache.value;
}
let majorCache: { at: number; items: { id: string; title: string; body: string; created_at: string }[] } | null = null;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

export const Route = createFileRoute("/api/public/player")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try { body = Body.parse(await request.json()); } catch { return json({ error: "Bad request" }, 400); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body.action === "register") {
          const token = randomHex(32);
          const { data, error } = await supabaseAdmin.from("player_devices")
            .insert({ token_hash: await sha256Hex(token), platform: body.platform, name: body.name ?? "BM Player" })
            .select("id").single();
          if (error) return json({ error: "Could not register" }, 500);
          return json({ device_id: data.id, device_token: token });
        }

        const { data: device } = await supabaseAdmin.from("player_devices").select("id, user_id, iptv_username, offsite_customer_id, last_seen_at, connected_since, vpn_status, vpn_checked_at, watching_kind, watching_title, watching_category, watching_since, watching_preview, platform, linked_at, name, geo_city, geo_country")
          .eq("token_hash", await sha256Hex(body.device_token)).maybeSingle();
        if (!device) return json({ error: "Unknown device" }, 401);
        // A linked box unused for 60 days is unlinked and must be linked again.
        const { isQuietBox, lockoutMinutes, WRONG_TRIES_PER_STEP, unusualPlace } = await import("@/lib/player-security");
        if ((device.user_id || device.offsite_customer_id) && isQuietBox(device.last_seen_at, device.linked_at)) {
          await supabaseAdmin.from("player_devices").delete().eq("id", device.id);
          return json({ error: "Unknown device" }, 401);
        }

        if (body.action === "announcement") {
          // Apps ask every few seconds; one shared read per 10s keeps this cheap for any number of players.
          // age_ms lets apps compare against their own start time without trusting the device clock;
          // announcements only reach apps that were already open when it was sent.
          const a = await currentAnnouncement(supabaseAdmin);
          const visible = a && announcementReachesDevice(a, device, Date.now());
          // "Watch on my box" from the website: hand over the newest fresh request once, then mark it collected.
          let watch: { kind: string; id: string | null; title: string } | null = null;
          if (device.user_id) {
            const since = new Date(Date.now() - WATCH_REQUEST_TTL_MS).toISOString();
            const { data: req } = await supabaseAdmin.from("player_watch_requests").select("id, kind, item_id, title")
              .eq("device_id", device.id).is("delivered_at", null).gte("created_at", since)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (req) {
              const { data: claimed } = await supabaseAdmin.from("player_watch_requests").update({ delivered_at: new Date().toISOString() })
                .eq("device_id", device.id).is("delivered_at", null).select("id");
              if (claimed?.some((c) => c.id === req.id)) watch = { kind: req.kind, id: req.item_id, title: req.title };
            }
          }
          // Another device on this login took over: tell this one to stop once.
          let stop_stream = false;
          const { data: stopRow } = await supabaseAdmin.from("player_devices").select("stream_stop_at").eq("id", device.id).maybeSingle();
          if (stopRow?.stream_stop_at) {
            stop_stream = true;
            await supabaseAdmin.from("player_devices").update({ stream_stop_at: null }).eq("id", device.id);
          }
          return json({ watch, stop_stream, announcement: visible ? { id: a.id, message: a.message, age_ms: Math.max(0, Date.now() - a.sent_at) } : null });
        }

        if (body.action === "rooms") {
          // Main-menu "who's watching": other devices on this same provider login, only for a linked box.
          if ((!device.user_id && !device.offsite_customer_id) || device.iptv_username !== body.login) return json({ rooms: [], connections: null });
          const { roomsWatching } = await import("@/lib/player-stream-claim");
          const { data: others } = await supabaseAdmin.from("player_devices").select("id, name, platform, last_seen_at, watching_kind, watching_title")
            .eq("iptv_username", body.login).neq("id", device.id).limit(50);
          // Connections come from the package: Single 1, Multi Room 2, Triple Room 3.
          const { data: connections } = await supabaseAdmin.rpc("player_login_connections", { p_login: body.login });
          return json({ rooms: roomsWatching(others ?? [], device.id), connections: connections ?? null });
        }

        if (body.action === "stream_claim" || body.action === "stream_release") {
          const nowIso = new Date().toISOString();
          if (body.action === "stream_release") {
            await supabaseAdmin.from("player_devices").update({ watching_kind: null, watching_title: null, watching_category: null, watching_player: null, watching_since: null, watching_preview: false, stream_claimed_at: null }).eq("id", device.id);
            return json({ ok: true });
          }
          const { streamClash } = await import("@/lib/player-stream-claim");
          const { data: others } = await supabaseAdmin.from("player_devices").select("id, name, platform, last_seen_at, watching_kind, watching_title")
            .eq("iptv_username", body.login).neq("id", device.id).limit(50);
          const { data: pkgMax } = await supabaseAdmin.rpc("player_login_connections", { p_login: body.login });
          const clash = streamClash(others ?? [], device.id, pkgMax ?? body.max, Date.now(), body.screens ?? 1);
          if (clash.length && !body.takeover) {
            return json({ busy: true, devices: clash.slice(0, 5).map((d) => ({ name: d.name || "BM Player", platform: d.platform, title: d.watching_title })) });
          }
          if (clash.length) {
            await supabaseAdmin.from("player_devices").update({ stream_stop_at: nowIso, watching_kind: null, watching_title: null, watching_category: null, watching_player: null, watching_since: null, watching_preview: false })
              .in("id", clash.map((d) => d.id));
          }
          // Multi/Triple Room: one home internet connection plus one phone on mobile data.
          let warning: string | null = null;
          let claimIp: string | null = null, claimMobile = false;
          if ((pkgMax ?? 1) >= 2 && device.user_id) {
            try {
              const { isPublicIp, checkDeviceVpn, lookupMobile } = await import("@/lib/player-vpn");
              const { householdVerdict } = await import("@/lib/player-household");
              const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
              if (ip && isPublicIp(ip)) {
                claimIp = ip;
                const [vpn, mobile, { data: home }, { data: mob }] = await Promise.all([
                  checkDeviceVpn(ip), lookupMobile(ip),
                  supabaseAdmin.from("player_login_homes").select("home_ip").eq("login", body.login).maybeSingle(),
                  supabaseAdmin.from("player_devices").select("id, last_seen_at, watching_kind, claim_mobile").eq("iptv_username", body.login).neq("id", device.id).eq("claim_mobile", true).not("watching_kind", "is", null).gte("last_seen_at", new Date(Date.now() - 3 * 60_000).toISOString()).limit(10),
                ]);
                claimMobile = mobile === true;
                const v = householdVerdict({ connections: pkgMax ?? 1, homeIp: home?.home_ip ?? null, ip, mobile: claimMobile, vpn: vpn.vpn_status === "yes", otherMobileWatching: (mob ?? []).filter((d) => !clash.some((c) => c.id === d.id)).length });
                if (v.setHome) await supabaseAdmin.from("player_login_homes").upsert({ login: body.login, home_ip: ip }, { onConflict: "login", ignoreDuplicates: true });
                warning = v.warn;
                if (v.kind !== "ok") {
                  const kind = v.kind === "vpn" ? "household_vpn" : v.kind === "second_mobile" ? "household_mobile" : "household_away";
                  const { count } = await supabaseAdmin.from("player_security_events").select("id", { count: "exact", head: true })
                    .eq("kind", kind).eq("login", body.login).eq("device_id", device.id).gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString());
                  if (!count) {
                    const city = device.geo_city ?? null, country = device.geo_country ?? null;
                    await supabaseAdmin.from("player_security_events").insert({ kind, device_id: device.id, owner_id: device.user_id, login: body.login,
                      detail: { device: device.name ?? device.platform, platform: device.platform, ip, home_ip: home?.home_ip ?? null, city, country, vpn_provider: vpn.vpn_provider ?? null, connections: pkgMax } });
                    const { notifyPlayerAdmins } = await import("@/lib/player-security.server");
                    const what = v.kind === "vpn" ? "is watching through a VPN, so its real location is hidden" : v.kind === "second_mobile" ? "is a second phone watching on mobile data" : "is watching away from the home internet connection";
                    await notifyPlayerAdmins(supabaseAdmin, "Multi Room rule", `A box on login ${body.login} ${what}.`);
                  }
                }
              }
            } catch (e) { console.warn("[stream_claim] household check failed", e); }
          }
          await supabaseAdmin.from("player_devices").update({
            claim_ip: claimIp, claim_mobile: claimMobile,
            iptv_username: body.login, last_seen_at: nowIso, stream_claimed_at: nowIso, stream_stop_at: null,
            watching_kind: body.kind === "catchup" ? "live" : body.kind, watching_title: body.title, watching_since: device.watching_kind ? device.watching_since : nowIso,
          }).eq("id", device.id);
          return json({ ok: true, took_over: clash.length, warning });
        }

        if (body.action === "major_announcements") {
          // Longer announcements for the top-right icon; members only, one shared read per 30s.
          if (!ratingVoter(device)) return json({ items: [] });
          const now = Date.now();
          if (!majorCache || now - majorCache.at > 30_000) {
            const { data } = await supabaseAdmin.from("player_major_announcements").select("id, title, body, created_at")
              .eq("active", true).order("created_at", { ascending: false }).limit(30);
            majorCache = { at: now, items: data ?? [] };
          }
          return json({ items: majorCache.items });
        }

        if (body.action === "ratings" || body.action === "vote") {
          const voter = ratingVoter(device);
          if (!voter) return json({ error: "Link this app to your BM Support account first." }, 403);
          const items = body.action === "vote" ? [{ kind: body.kind, title: body.title }] : body.items;
          const keyed = await Promise.all(items.map(async item => ({ ...item, key: await sha256Hex(ratingIdentity(item.kind, item.title)) })));
          if (body.action === "vote") {
            const { error } = await supabaseAdmin.rpc("player_cast_rating", { p_voter: voter, p_key: keyed[0].key, p_stars: body.stars });
            if (error?.message.includes("Already voted")) return json({ error: "You've already voted on this. Votes can't be changed." }, 409);
            if (error) return json({ error: error.message.includes("Rate limit") ? "Too many votes. Wait a minute and try again." : "Couldn't save your vote. Try again." }, error.message.includes("Rate limit") ? 429 : 503);
          }
          const keys = keyed.map(item => item.key);
          const [{ data: totals, error: totalsError }, { data: mine, error: mineError }] = await Promise.all([
            supabaseAdmin.from("player_rating_totals").select("media_key, star_sum, vote_count").in("media_key", keys),
            supabaseAdmin.from("player_ratings").select("media_key, stars").eq("voter_key", voter).in("media_key", keys),
          ]);
          if (totalsError || mineError) return json({ error: "Ratings aren't available right now." }, 503);
          return json({ ratings: keyed.map(item => {
            const total = totals?.find(row => row.media_key === item.key);
            const count = Number(total?.vote_count || 0);
            return { kind: item.kind, title: item.title, count, average: count ? Math.round(Number(total?.star_sum || 0) / count * 10) / 10 : null, mine: mine?.find(row => row.media_key === item.key)?.stars ?? null };
          }) });
        }

        if (body.action === "favourites" || body.action === "favourites_set") {
          // Favourites follow the account owner across every linked device, kept per provider login
          // because channel/film ids only mean something within one login.
          const owner = ratingVoter(device);
          if (!owner) return json({ error: "Link this app to your BM Support account first." }, 403);
          const scope = await sha256Hex(body.login.toLowerCase());
          if (body.action === "favourites_set") {
            const { error } = await supabaseAdmin.from("player_favourites")
              .upsert({ owner_key: owner, scope_key: scope, items: body.items as unknown as import("@/integrations/supabase/types").Json, updated_at: new Date().toISOString() });
            if (error) return json({ error: "Couldn't save favourites." }, 503);
            return json({ ok: true, items: body.items, stored: true });
          }
          const { data, error } = await supabaseAdmin.from("player_favourites").select("items")
            .eq("owner_key", owner).eq("scope_key", scope).maybeSingle();
          if (error) return json({ error: "Favourites aren't available right now." }, 503);
          return json({ items: data?.items ?? [], stored: !!data });
        }

        if (body.action === "progress" || body.action === "progress_set") {
          // Film/series positions follow the account owner across devices, per provider login; newest update wins.
          const owner = ratingVoter(device);
          if (!owner) return json({ error: "Link this app to your BM Support account first." }, 403);
          const scope = await sha256Hex(body.login.toLowerCase());
          if (body.action === "progress_set") {
            const { newerThanStored } = await import("@/lib/player-progress");
            const now = Date.now();
            const items = body.items.map(i => ({ ...i, updated_at: i.age_ms !== undefined ? now - i.age_ms : Math.min(i.updated_at, now) }));
            const { data: stored, error: readErr } = await supabaseAdmin.from("player_watch_progress").select("item_key, updated_at")
              .eq("owner_key", owner).eq("scope_key", scope).in("item_key", items.map(i => i.key));
            if (readErr) return json({ error: "Couldn't save progress." }, 503);
            const fresh = newerThanStored(items, stored ?? []);
            if (fresh.length) {
              const { error } = await supabaseAdmin.from("player_watch_progress").upsert(fresh.map(i => ({
                owner_key: owner, scope_key: scope, item_key: i.key, position_ms: i.position_ms, duration_ms: i.duration_ms,
                updated_at: new Date(i.updated_at).toISOString(),
              })));
              if (error) return json({ error: "Couldn't save progress." }, 503);
            }
            return json({ ok: true, saved: fresh.length });
          }
          const { data, error } = await supabaseAdmin.from("player_watch_progress").select("item_key, position_ms, duration_ms, updated_at")
            .eq("owner_key", owner).eq("scope_key", scope).order("updated_at", { ascending: false }).limit(2000);
          if (error) return json({ error: "Progress isn't available right now." }, 503);
          return json({ now: Date.now(), items: (data ?? []).map(r => ({ key: r.item_key, position_ms: Number(r.position_ms), duration_ms: Number(r.duration_ms), updated_at: new Date(r.updated_at).getTime() })) });
        }

        if (body.action === "unlink") {
          await supabaseAdmin.from("player_devices").delete().eq("id", device.id);
          return json({ ok: true });
        }

        if (body.action === "unlock_status") {
          // Set from the website subscription box; one use, valid for 2 minutes.
          // Polling the unlock screen counts as a check-in, so the website shows the box as On.
          const { data: r } = await supabaseAdmin.from("player_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id).select("remote_unlock_at").single();
          const at = r?.remote_unlock_at ? Date.parse(r.remote_unlock_at) : 0;
          // Approval requests (website pop-up, email, QR) are retired: boxes unlock by account number only.
          if (!at && APPROVAL_REQUESTS_RETIRED) return json({ unlocked: false });
          if (!at) {
            // Ask the owner to approve this login on the website (one request per 5 minutes per box).
            if (device.user_id) {
              const since = new Date(Date.now() - 5 * 60_000).toISOString();
              const { data: open } = await supabaseAdmin.from("player_login_approvals" as any).select("id").eq("device_id", device.id).gt("created_at", since).limit(1);
              if (!open?.length) {
                await supabaseAdmin.from("player_login_approvals" as any).insert({ device_id: device.id, owner_id: device.user_id });
                const title = "Approve BM Player login";
                const msg = "A BM Player app is asking to open on your account. Tap to approve or deny.";
                await supabaseAdmin.from("user_notifications").insert({ user_id: device.user_id, kind: "mention", title, body: msg, link_path: "/home", source_type: "player_login" } as any);
                try { const { pushToUser } = await import("@/lib/fcm.server"); await pushToUser(device.user_id, { title, body: msg, data: { link: "/home" } }); } catch (e) { console.error("[player login push]", e); }
              }
            } else if (device.offsite_customer_id) {
              // No website account: a QR on the box (customer scans and types their account number),
              // an emailed one-time link, or staff approval from the dashboard.
              // The link token is derived from the device token + request id, so only this box can show it.
              const sha = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))).map((b) => b.toString(16).padStart(2, "0")).join("");
              const since = new Date(Date.now() - 10 * 60_000).toISOString();
              const { data: open } = await supabaseAdmin.from("player_login_approvals" as any).select("id").eq("device_id", device.id).eq("status", "pending").gt("created_at", since).order("created_at", { ascending: false }).limit(1) as any;
              let id: string | undefined = open?.[0]?.id;
              let raw = "";
              if (!id) {
                id = crypto.randomUUID();
                raw = await sha(`${body.device_token}:${id}`);
                await supabaseAdmin.from("player_login_approvals" as any).insert({ id, device_id: device.id, offsite_customer_id: device.offsite_customer_id, token_hash: await sha(raw) });
                const { data: oc } = await supabaseAdmin.from("player_offsite_customers").select("customer_name, email").eq("id", device.offsite_customer_id as string).maybeSingle();
                if (oc?.email) {
                  try {
                    const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
                    await sendAndLogEmail(supabaseAdmin, "player-login-approval", oc.email, {
                      templateData: { name: oc.customer_name, device: device.platform ?? "BM Player", approveUrl: `https://bmsupport.uk/player-approve/${raw}` },
                      idempotencyKey: `player-login-${raw.slice(0, 24)}`,
                    });
                  } catch (e) { console.error("[player login email]", e); }
                }
              } else raw = await sha(`${body.device_token}:${id}`);
              const qrUrl = `https://bmsupport.uk/player-approve/${raw}`;
              let qrSvg: string | undefined;
              try { const QR = await import("qrcode"); qrSvg = await QR.toString(qrUrl, { type: "svg", margin: 1, width: 240 }); } catch (e) { console.error("[player login qr]", e); }
              return json({ unlocked: false, qr_url: qrUrl, qr_svg: qrSvg });
            }
            return json({ unlocked: false });
          }
          await supabaseAdmin.from("player_devices").update({ remote_unlock_at: null, unlock_failures: 0, unlock_locked_until: null }).eq("id", device.id);
          return json({ unlocked: Date.now() - at <= 2 * 60_000 });
        }

        // Lost authenticator (customers without a website account): email a one-off chat link that hands out a reset code.
        if (body.action === "totp_reset_request") {
          if (!device.offsite_customer_id) return json({ error: "Reset your 2FA on bmsupport.uk under Security settings, or contact BM Support." }, 400);
          const { data: oc } = await supabaseAdmin.from("player_offsite_customers").select("customer_name, email").eq("id", device.offsite_customer_id).maybeSingle();
          if (!oc?.email) return json({ error: "We don't have an email for you. Please contact BM Support." }, 400);
          const since = new Date(Date.now() - 10 * 60_000).toISOString();
          const { data: recent } = await supabaseAdmin.from("player_2fa_resets").select("id").eq("offsite_customer_id", device.offsite_customer_id).gt("created_at", since).limit(1);
          if (recent?.length) return json({ ok: true, sent: true });
          // Older unfinished links die when a new one is made, so only the newest address ever works.
          await supabaseAdmin.from("player_2fa_resets").update({ status: "expired", closed_at: new Date().toISOString() }).eq("offsite_customer_id", device.offsite_customer_id).in("status", ["open", "code_issued"]);
          const { newResetToken, sha256Hex } = await import("@/lib/player-2fa-reset");
          const raw = newResetToken();
          await supabaseAdmin.from("player_2fa_resets").insert({ offsite_customer_id: device.offsite_customer_id, device_id: device.id, token_hash: await sha256Hex(raw) });
          try {
            const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
            await sendAndLogEmail(supabaseAdmin, "player-2fa-reset-link", oc.email, {
              templateData: { name: oc.customer_name, chatUrl: `https://bmsupport.uk/2fa-help/${raw}` },
              idempotencyKey: `player-2fa-reset-${raw.slice(0, 24)}`,
            });
          } catch (e) { console.error("[2fa reset email]", e); return json({ error: "Couldn't send the email. Try again shortly." }, 500); }
          return json({ ok: true, sent: true });
        }

        // First-visit 2FA setup on the box itself: QR to scan into an authenticator app, then one code to confirm.
        if (body.action === "totp_start" || body.action === "totp_confirm") {
          if (!device.user_id && !device.offsite_customer_id) return json({ error: "Link this app first." }, 403);
          const key = device.user_id ? { owner_id: device.user_id } : { offsite_customer_id: device.offsite_customer_id as string };
          const col = device.user_id ? "owner_id" : "offsite_customer_id";
          const val = (device.user_id ?? device.offsite_customer_id) as string;
          const { data: cur } = await supabaseAdmin.from("player_totp").select("enabled, pending_secret").eq(col, val).maybeSingle();
          if (cur?.enabled) return json({ error: "2FA is already set up on this account." }, 409);
          const T = await import("@/lib/player-totp");
          if (body.action === "totp_start") {
            const secret = T.newTotpSecret();
            const { error } = cur
              ? await supabaseAdmin.from("player_totp").update({ pending_secret: secret, updated_at: new Date().toISOString() }).eq(col, val)
              : await supabaseAdmin.from("player_totp").insert({ ...key, pending_secret: secret });
            if (error) return json({ error: "Couldn't start 2FA set up. Try again." }, 500);
            const url = T.totpUrl(secret, device.iptv_username ?? "BM Player");
            const QR = await import("qrcode");
            const svg = (u: string) => QR.toString(u, { type: "svg", margin: 1, width: 240 });
            return json({ secret, otpauth: url, qr_svg: await svg(url),
              apps: { apple: T.AUTH_APP_APPLE, android: T.AUTH_APP_ANDROID },
              apple_qr_svg: await svg(T.AUTH_APP_APPLE), android_qr_svg: await svg(T.AUTH_APP_ANDROID) });
          }
          if (!cur?.pending_secret || !(await T.totpMatches(cur.pending_secret, body.code))) return json({ error: "That code isn't right. Type the newest 6-digit code from your authenticator app." }, 401);
          await supabaseAdmin.from("player_totp").update({ secret: cur.pending_secret, pending_secret: null, enabled: true, updated_at: new Date().toISOString() }).eq(col, val);
          await supabaseAdmin.from("player_devices").update({ totp_passed_at: new Date().toISOString() }).eq("id", device.id);
          const { issueBackupCodes } = await import("@/lib/player-backup-codes");
          await issueBackupCodes(supabaseAdmin, key);
          return json({ ok: true, backup_codes_saved: !!device.user_id });
        }

        // The 4-digit PIN is retired: 2FA (authenticator app) is the only main-menu lock, once a day per box.
        // Can't reach the authenticator? One of the 10 one-use backup codes (8 digits) opens it instead.
        // 2FA is retired: boxes sign in once (website code or the QR help chat) and are never asked again.
        if (body.action === "pin_status") return json({ required: false, needs_setup: false, totp_setup: false });

        // No website account: a QR on the box opens a one-off chat that checks account number + email
        // and shows a 6-digit code (10 minutes). Each new chat retires the box's older ones.
        // Everyone needs a website account now: the no-account help chat is switched off.
        if (body.action === "signin_chat") return json({ error: "Make a free account at bmsupport.uk, then use the code on the Link Device page." }, 410);

        if (body.action === "signin_code") {
          const { data: lk } = await supabaseAdmin.from("player_devices").select("unlock_failures, unlock_locked_until, unlock_lock_level").eq("id", device.id).single();
          if (lk?.unlock_locked_until && Date.parse(lk.unlock_locked_until) > Date.now()) return json({ error: "Too many wrong codes. Please wait and try again." }, 429);
          const nowIso = new Date().toISOString();
          // Code shown on the website's Link Device page.
          const hash = await sha256Hex(body.code);
          const { data: sc } = await supabaseAdmin.from("player_signin_codes").update({ used_at: nowIso }).eq("code_hash", hash).is("used_at", null).gt("expires_at", nowIso).select("owner_id, username, password").maybeSingle();
          if (sc) {
            if (device.user_id && device.user_id !== sc.owner_id) return json({ error: "This box is linked to another account." }, 409);
            const isNew = !device.user_id;
            await supabaseAdmin.from("player_devices").update({ user_id: sc.owner_id, linked_at: nowIso, iptv_username: sc.username, unlock_failures: 0, unlock_locked_until: null, totp_passed_at: nowIso }).eq("id", device.id);
            const { queuePlayerLogin, notifyNewBox } = await import("@/lib/player-security.server");
            const { held } = await queuePlayerLogin(supabaseAdmin, { deviceId: device.id, ownerId: sc.owner_id, username: sc.username, password: sc.password });
            if (isNew) await notifyNewBox(supabaseAdmin, sc.owner_id, device.id, device.platform);
            return json({ ok: true, linked: true, held });
          }
          const fails = (lk?.unlock_failures ?? 0) + 1;
          const locked = fails >= WRONG_TRIES_PER_STEP;
          const level = locked ? (lk?.unlock_lock_level ?? 0) + 1 : (lk?.unlock_lock_level ?? 0);
          await supabaseAdmin.from("player_devices").update({ unlock_failures: locked ? 0 : fails, unlock_locked_until: locked ? new Date(Date.now() + lockoutMinutes(level) * 60_000).toISOString() : null, unlock_lock_level: level }).eq("id", device.id);
          return json({ error: locked ? `Too many wrong codes. Please wait ${lockoutMinutes(level)} minutes.` : "That code is wrong or has run out. Get a new one and try again." }, locked ? 429 : 401);
        }

        if (body.action === "pin_check" || body.action === "pin_create") {
          if (!device.user_id && !device.offsite_customer_id) return json({ required: false });
          if (body.action === "pin_create") return json({ error: "PINs are no longer used. Set up 2FA instead." }, 410);
          const key = device.user_id ? { owner_id: device.user_id } : { offsite_customer_id: device.offsite_customer_id as string };
          const { data: totp } = device.user_id
            ? await supabaseAdmin.from("player_totp").select("secret, enabled").eq("owner_id", device.user_id).maybeSingle()
            : await supabaseAdmin.from("player_totp").select("secret, enabled").eq("offsite_customer_id", device.offsite_customer_id as string).maybeSingle();
          const { totpMatches } = await import("@/lib/player-totp");
          const { data: dv } = await supabaseAdmin.from("player_devices").select("totp_passed_at, pin_failures, pin_locked_until, pin_lock_level").eq("id", device.id).single();
          if (!totp?.enabled || !totp.secret) {
            return json({ error: "Set up 2FA first." }, 409);
          }
          const waitT = (until: string) => {
            const mins = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000));
            return `Too many wrong codes. Please wait ${mins >= 120 ? `${Math.ceil(mins / 60)} hours` : `${mins} minutes`} and try again.`;
          };
          if (dv?.pin_locked_until && Date.parse(dv.pin_locked_until) > Date.now()) return json({ error: waitT(dv.pin_locked_until) }, 429);
          const { useBackupCode } = await import("@/lib/player-backup-codes");
          const isBackup = !/^\d{6}$/.test(body.pin);
          // 8 digits that aren't a backup code may be a 2FA reset code from the help chat: clears 2FA so the box sets it up again.
          if (isBackup && device.offsite_customer_id) {
            const { data: rs } = await supabaseAdmin.from("player_2fa_resets").select("id, code").eq("offsite_customer_id", device.offsite_customer_id).eq("status", "code_issued").gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
            if (rs?.code && rs.code === body.pin.replace(/[\s-]/g, "")) {
              await supabaseAdmin.from("player_totp").delete().eq("offsite_customer_id", device.offsite_customer_id);
              await supabaseAdmin.from("player_backup_codes").delete().eq("offsite_customer_id", device.offsite_customer_id);
              await supabaseAdmin.from("player_devices").update({ totp_passed_at: null, pin_failures: 0, pin_locked_until: null, pin_lock_level: 0 }).eq("offsite_customer_id", device.offsite_customer_id);
              await supabaseAdmin.from("player_2fa_resets").update({ status: "reset", code: null }).eq("id", rs.id);
              return json({ ok: true, reset: true });
            }
          }
          const ok = isBackup ? await useBackupCode(supabaseAdmin, key, body.pin) : await totpMatches(totp.secret, body.pin);
          if (ok) {
            await supabaseAdmin.from("player_devices").update({ totp_passed_at: new Date().toISOString(), pin_failures: 0, pin_locked_until: null, pin_lock_level: 0 }).eq("id", device.id);
            return json({ ok: true });
          }
          const fails = (dv?.pin_failures ?? 0) + 1;
          const locked = fails >= WRONG_TRIES_PER_STEP;
          const level = locked ? (dv?.pin_lock_level ?? 0) + 1 : (dv?.pin_lock_level ?? 0);
          const until = locked ? new Date(Date.now() + lockoutMinutes(level) * 60_000).toISOString() : null;
          await supabaseAdmin.from("player_devices").update({ pin_failures: locked ? 0 : fails, pin_locked_until: until, pin_lock_level: level }).eq("id", device.id);
          if (locked) {
            await supabaseAdmin.from("player_security_events").insert({ kind: "lockout", device_id: device.id, owner_id: device.user_id, login: device.iptv_username, detail: { level, totp: true } });
            const { notifyPlayerAdmins } = await import("@/lib/player-security.server");
            await notifyPlayerAdmins(supabaseAdmin, "BM Player 2FA lockout", `A ${device.platform ?? "BM Player"} box${device.iptv_username ? ` on login ${device.iptv_username}` : ""} kept entering wrong 2FA codes and is locked for ${lockoutMinutes(level) >= 60 ? `${lockoutMinutes(level) / 60} hour(s)` : `${lockoutMinutes(level)} minutes`}.`);
          }
          return json({ error: locked ? waitT(until as string) : isBackup ? "That backup code isn't right or has already been used." : "That code isn't right. Open your authenticator app and type the newest 6-digit BM Player code." }, locked ? 429 : 401);
        }

        if (body.action === "unlock") {
          if (!device.user_id && !device.offsite_customer_id) return json({ error: "Link this app to your BM Support account first." }, 403);
          const { data: lock } = await supabaseAdmin.from("player_devices").select("unlock_failures, unlock_locked_until, unlock_lock_level").eq("id", device.id).single();
          const waitText = (until: string) => {
            const mins = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000));
            return `Too many wrong tries. Please wait ${mins >= 120 ? `${Math.ceil(mins / 60)} hours` : `${mins} minutes`} and try again.`;
          };
          if (lock?.unlock_locked_until && new Date(lock.unlock_locked_until).getTime() > Date.now())
            return json({ error: waitText(lock.unlock_locked_until) }, 429);
          // Each app login has its own number: a customer's second single-connection login unlocks with its own.
          const { data: cn } = device.user_id
            ? await supabaseAdmin.rpc("device_login_player_number", { _owner: device.user_id, _login: device.iptv_username ?? "" })
                .then((r) => ({ data: r.data == null ? null : { number: r.data as number } }))
            : await supabaseAdmin.from("player_offsite_customers").select("number").eq("id", device.offsite_customer_id as string).maybeSingle();
          if (cn && String(cn.number) === body.account_number) {
            await supabaseAdmin.from("player_devices").update({ unlock_failures: 0, unlock_locked_until: null, unlock_lock_level: 0 }).eq("id", device.id);
            return json({ ok: true });
          }
          const fails = (lock?.unlock_failures ?? 0) + 1;
          const locked = fails >= WRONG_TRIES_PER_STEP;
          // Each further run of wrong tries locks longer: 15 minutes, then 1 hour, then 24 hours.
          const level = locked ? (lock?.unlock_lock_level ?? 0) + 1 : (lock?.unlock_lock_level ?? 0);
          const until = locked ? new Date(Date.now() + lockoutMinutes(level) * 60_000).toISOString() : null;
          await supabaseAdmin.from("player_devices").update({
            unlock_failures: locked ? 0 : fails,
            unlock_locked_until: until,
            unlock_lock_level: level,
          }).eq("id", device.id);
          if (locked && lockoutMinutes(level) >= 24 * 60) {
            await supabaseAdmin.from("player_security_events").insert({ kind: "lockout", device_id: device.id, owner_id: device.user_id, login: device.iptv_username, detail: { level } });
            const { notifyPlayerAdmins } = await import("@/lib/player-security.server");
            await notifyPlayerAdmins(supabaseAdmin, "BM Player locked for 24 hours", `A ${device.platform ?? "BM Player"} box${device.iptv_username ? ` on login ${device.iptv_username}` : ""} kept entering the wrong account number.`);
          }
          return json({ error: locked ? waitText(until as string) : "That account number isn't right. You can find it in your subscription box on bmsupport.uk." }, locked ? 429 : 401);
        }

        if (body.action === "voice") {
          if (!device.user_id && !device.offsite_customer_id) return json({ error: "Link this app to your BM Support account first." }, 403);
          const { voiceAllowed, transcribeVoice, VOICE_MAX_BYTES } = await import("@/lib/player-voice");
          if (!voiceAllowed(device.id)) return json({ error: "Too many voice searches. Wait a moment and try again." }, 429);
          const bytes = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
          if (bytes.length < 2048 || bytes.length > VOICE_MAX_BYTES) return json({ error: "That recording was too short or too long. Try again." }, 400);
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return json({ error: "Voice search isn't set up yet." }, 503);
          const r = await transcribeVoice(bytes, body.mime, key);
          if (!r.ok) return json({ error: r.status === 429 ? "Voice search is busy. Try again in a moment." : "Voice search isn't available right now." }, r.status === 429 ? 429 : 503);
          if (!r.text) return json({ error: "Didn't catch that. Try again and speak clearly." }, 422);
          return json({ text: r.text });
        }

        if (body.action === "report") {
          if (!device.user_id) return json({ error: "Link this app to your BM Support account first." }, 403);
          if (body.kind === "live") {
            const { data, error } = await supabaseAdmin.rpc("create_player_fault_ticket", {
              _device_id: device.id, _title: body.title, _category: body.category ?? "",
              _issue: body.issue, _device: body.device ?? "Unknown", _version: body.version ?? "",
            });
            if (error) return json({ error: "Couldn't open a ticket. Try again." }, 503);
            const result = data as { duplicate?: boolean; rate_limited?: boolean; ok?: boolean; ticket_id?: string } | null;
            if (result?.duplicate) return json({ duplicate: true, error: "A fault is already reported for this channel. Please try another channel while staff investigate." }, 409);
            if (result?.rate_limited) return json({ error: "You've just sent a few reports. Our staff will be with you shortly." }, 429);
            if (!result?.ok) return json({ error: "Couldn't open a ticket. Try again." }, 503);
            return json(result);
          }
          const { count } = await supabaseAdmin.from("tickets").select("id", { count: "exact", head: true })
            .eq("user_id", device.user_id).like("subject", "BM Player:%").gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
          if ((count ?? 0) >= 3) return json({ error: "You've just sent a few reports. Our staff will be with you shortly." }, 429);
          const slug = "movies-series";
          const { data: cat } = await supabaseAdmin.from("ticket_categories").select("id").eq("slug", slug).maybeSingle();
          if (!cat) return json({ error: "Couldn't open a ticket. Try again." }, 503);
          const label = body.kind === "film" ? "Film" : "Series";
          const { data: t, error: tErr } = await supabaseAdmin.from("tickets")
            .insert({ user_id: device.user_id, subject: `BM Player: ${label} – ${body.title}`.slice(0, 200), category_id: cat.id, priority: "normal" })
            .select("id").single();
          if (tErr || !t) return json({ error: "Couldn't open a ticket. Try again." }, 503);
          const lines = [
            "Reported from BM Player", "",
            `${label}: ${body.title}`,
            body.episode ? `Episode: ${body.episode}` : null,
            body.category ? `Category: ${body.category}` : null,
            `Device: ${body.device || "Unknown"}${body.version ? ` · BM Player ${body.version}` : ""}`,
            "", `Problem: ${body.issue}`,
          ].filter((l) => l !== null).join("\n");
          await supabaseAdmin.from("ticket_messages").insert({ ticket_id: t.id, sender_id: device.user_id, is_internal: false, content: lines });
          return json({ ok: true, ticket_id: t.id });
        }

        if (body.action === "formats" || body.action === "format_set") {
          // Steadier stream type per channel, learned on any device and shared with all of them.
          if (body.action === "format_set") {
            const { error } = await supabaseAdmin.from("player_channel_formats")
              .upsert({ content_id: body.content_id, fmt: body.fmt, updated_at: new Date().toISOString() });
            if (error) return json({ error: "Could not save" }, 503);
            return json({ ok: true });
          }
          const { data } = await supabaseAdmin.from("player_channel_formats").select("content_id, fmt").limit(20000);
          return json({ formats: Object.fromEntries((data ?? []).map((r) => [r.content_id, r.fmt])) });
        }

        if (body.action === "buffering") {
          const now = Date.now();
          const { data: dev } = await supabaseAdmin.from("player_devices").select("platform, app_version").eq("id", device.id).maybeSingle();
          const rows = body.events.map((e) => ({
            device_id: device.id, user_id: device.user_id, platform: dev?.platform ?? null, app_version: body.version ?? dev?.app_version ?? null,
            kind: e.kind, content_id: e.content_id, content_name: e.name, stall_ms: e.stall_ms, reconnected: e.reconnected, is_freeze: e.freeze ?? false, cause: stallCause(e),
            stream_format: e.stream_format ?? null, decoder: e.decoder ?? null, recovery_provider: e.recovery_provider ?? null, event_name: e.event_name ?? null, swapped_to: e.swapped_to ?? null, swap_reason: e.swap_reason ?? null,
            occurred_at: new Date(eventTime(e.at, now)).toISOString(),
          }));
          const { error } = await supabaseAdmin.from("player_buffer_events").insert(rows);
          if (error) return json({ error: "Could not record" }, 503);
          // A channel stalling for many different viewers at once points at the provider, not one home's internet.
          for (const name of [...new Set(rows.filter((r) => r.kind === "live" && r.content_name).map((r) => r.content_name))]) {
            const { data: recent } = await supabaseAdmin.from("player_buffer_events").select("device_id")
              .eq("kind", "live").eq("content_name", name).gte("occurred_at", new Date(now - ALERT_WINDOW_MS).toISOString()).limit(500);
            if (!shouldAlert(new Set((recent ?? []).map((r) => r.device_id)).size)) continue;
            const title = `Channel buffering for many viewers: ${name}`.slice(0, 200);
            const { data: sent } = await supabaseAdmin.from("staff_notifications").select("id").eq("kind", "player_buffering")
              .eq("title", title).gte("created_at", new Date(now - ALERT_COOLDOWN_MS).toISOString()).limit(1);
            if (sent?.length) continue;
            await supabaseAdmin.from("staff_notifications").insert({
              kind: "player_buffering", title,
              body: `${new Set((recent ?? []).map((r) => r.device_id)).size} BM Player devices stalled on ${name} in the last 10 minutes – likely a provider problem.`,
              link_path: "/admin-player-live",
            });
          }
          return json({ ok: true, recorded: rows.length });
        }

        if (body.action === "subtitle_check") {
          // Quiet survey: does this live channel's stream carry subtitle tracks? Nothing shown to viewers.
          const name = body.name;
          const key = name.toLowerCase(); const has = body.tracks > 0;
          const langs = body.languages || null;
          const { data: row } = await supabaseAdmin.from("player_channel_subtitles").select("checks, checks_with_subs, languages").eq("channel_key", key).maybeSingle();
          const { error } = await supabaseAdmin.from("player_channel_subtitles").upsert({
            channel_key: key, channel_name: name, has_subtitles: has || (row?.checks_with_subs ?? 0) > 0,
            languages: langs ?? row?.languages ?? null, checks: (row?.checks ?? 0) + 1,
            checks_with_subs: (row?.checks_with_subs ?? 0) + (has ? 1 : 0), last_checked_at: new Date().toISOString(),
          });
          if (error) return json({ error: "Could not record" }, 503);
          return json({ ok: true });
        }

        if (body.action === "channel_health") {
          // Live channel failed / black screen / played cleanly for 2 minutes on this device.
          const key = body.name.toLowerCase(); const nowIso = new Date().toISOString();
          if (body.status !== "ok") {
            // Event-only channels are blank between events: only count reports from 10 min before an event using it.
            const { isEventChannel, acceptProblemReport } = await import("@/lib/player-channel-health");
            if (isEventChannel(body.name)) {
              const { buildSportsFeed } = await import("@/lib/player-sports-feed.server");
              const feed = await sportsCache(buildSportsFeed).catch(() => null);
              if (!acceptProblemReport(body.name, (feed?.events ?? []) as { start: number; end?: number; channels: string[] }[], Date.now())) return json({ ok: true, ignored: true });
            }
          }
          const { data: row } = await supabaseAdmin.from("player_channel_health").select("reporters, last_problem_at").eq("channel_key", key).maybeSingle();
          const fresh = row?.last_problem_at && Date.now() - Date.parse(row.last_problem_at) < 15 * 60_000;
          const patch = body.status === "ok"
            ? { last_ok_at: nowIso }
            : { problem: body.status === "black" ? "Black screen" : "Won't play", problem_source: "player", last_problem_at: nowIso, reporters: (fresh ? row?.reporters ?? 0 : 0) + 1 };
          const { error } = await supabaseAdmin.from("player_channel_health").upsert({ channel_key: key, channel_name: body.name, updated_at: nowIso, ...patch });
          if (error) return json({ error: "Could not record" }, 503);
          return json({ ok: true });
        }

        if (body.action === "connection_alert") {
          const { CONNECTION_REPORT_COOLDOWN_MS, isSustainedConnectionExcess } = await import("@/lib/player-connection-limit");
          if (!isSustainedConnectionExcess({ active: body.active, max: body.max, exceededSince: body.exceeded_since, now: Date.now() }))
            return json({ error: "Connection limit has not been exceeded long enough" }, 400);
          const { data: recent } = await supabaseAdmin.from("player_connection_reports").select("id")
            .eq("device_id", device.id).gte("created_at", new Date(Date.now() - CONNECTION_REPORT_COOLDOWN_MS).toISOString()).limit(1).maybeSingle();
          if (recent) return json({ ok: true, reported: true, duplicate: true });
          const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
          const { error } = await supabaseAdmin.from("player_connection_reports").insert({
            device_id: device.id, user_id: device.user_id, iptv_username: body.login || null,
            active_connections: body.active, max_connections: body.max,
            exceeded_since: new Date(body.exceeded_since).toISOString(), ip, app_version: body.version || null,
          });
          if (error) return json({ error: "Could not report" }, 503);
          return json({ ok: true, reported: true });
        }

        if (body.action === 'guide_category_open') {
          const { retiredCategoryRefresh } = await import('@/lib/provider-epg-policy');
          return json(retiredCategoryRefresh());
        }

        if (body.action === "guide") {
          const { providerGuideFallback } = await import('@/lib/provider-epg-policy');
          const { isOfficialSportsChannel } = await import('@/lib/sports-programme-end');
          const { needsSportsEvents } = await import('@/lib/real-epg');
          if (!needsSportsEvents(body.channel, isOfficialSportsChannel(body.channel), false)) return json(providerGuideFallback());
          const { buildSportsFixtures } = await import('@/lib/player-sports-feed.server');
          const { sportsFixtureEpg } = await import('@/lib/sports-fixture-epg');
          const feed = await buildSportsFixtures();
          return json(sportsFixtureEpg(body.channel, feed.events));
        }

        if (body.action === "sports") {
          const { buildSportsFeed, currentCrossData } = await import("@/lib/player-sports-feed.server");
          const { eventUnavailable, isEventChannel, crossedChannels } = await import("@/lib/player-channel-health");
          const payload = await sportsCache(buildSportsFeed);
          // Crossed channels change minute to minute, so they're added outside the guide cache.
          // Crosses only show from 10 min before an event until it ends; event-only channels only
          // count problems from that event's own window.
          const data = await currentCrossData().catch(() => ({ rows: [], stalls: [], at: Date.now() }));
          // Ticket faults never expire with the 15-minute health window. Read them fresh,
          // exposing channel names only, never another customer's ticket or message.
          const { activeFaultChannels, eventTicketFaults } = await import("@/lib/player-ticket-faults");
          const { data: tickets, error: faultError } = await supabaseAdmin.from("tickets")
            .select("player_channel_name, player_channel_key, status")
            .not("player_channel_key", "is", null).not("status", "in", "(resolved,closed)");
          if (faultError) return json({ error: "Couldn't refresh channel faults. Try again." }, 503);
          const faults = activeFaultChannels(tickets ?? []);
          const now = Date.now();
          const events = (payload.events as { start: number; end?: number; channels: string[] }[]).map((e) => {
            const ticketFaults = eventTicketFaults(e, faults);
            const unavailable = [...new Set([...eventUnavailable(e, data.rows, data.stalls, now), ...ticketFaults])];
            return { ...e, unavailable, ticketFaults };
          });
          const perEvent = new Set(events.flatMap((e) => ((e as { unavailable?: string[] }).unavailable ?? []).map((c) => c.toLowerCase())));
          // Global list (older apps): 24/7 channels as before, event channels only when crossed on an open event.
          const down = crossedChannels(data.rows, data.stalls, now).filter((c) => !isEventChannel(c) || perEvent.has(c.toLowerCase()));
          return json({ ...payload, events, ticketFaults: faults, unavailable: [...new Set([...down, ...faults])], version: payload.version + ":faults:" + JSON.stringify(faults) });
        }

        if (body.action === "code") {
          await supabaseAdmin.from("player_link_codes").delete().eq("device_id", device.id);
          for (let i = 0; i < 5; i++) {
            const code = randomCode();
            const expires = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
            const { error } = await supabaseAdmin.from("player_link_codes")
              .insert({ code_hash: await sha256Hex(code), device_id: device.id, expires_at: expires });
            if (!error) return json({ code, expires_at: expires });
          }
          return json({ error: "Try again" }, 500);
        }

        // poll: DNS + one-time credential handover
        const { presenceUpdate } = await import("@/lib/player-live");
        const { checkDeviceVpn, needsVpnCheck } = await import("@/lib/player-vpn");
        const now = Date.now();
        console.log(`[player poll] device=${device.id.slice(0, 8)} v=${body.version ?? "?"} watching=${body.watching ? body.watching.kind : "none"}`);
        const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        const fields = presenceUpdate({
          now, lastSeenAt: device.last_seen_at, connectedSince: device.connected_since,
          login: body.login, version: body.version, watching: body.watching ?? null,
          ip,
          cf: (request as unknown as { cf?: Record<string, unknown> }).cf ?? null,
          headerCountry: request.headers.get("cf-ipcountry"),
        });
        const { appGenuine } = await import("@/lib/player-security");
        const genuine = appGenuine(device.platform, body.sig);
        if (genuine === "fake") console.warn(`[player poll] altered app refused device=${device.id.slice(0, 8)}`);
        const [{ data: settings }, { data: pending }] = await Promise.all([
          supabaseAdmin.from("player_settings").select("dns, maintenance_enabled, maintenance_message, checkin_slowdown").eq("id", 1).maybeSingle(),
          // Logins only go to linked, genuine apps, and never while held for the box limit.
          (device.user_id || device.offsite_customer_id) && genuine === "ok"
            ? supabaseAdmin.from("player_pending_credentials").delete().eq("device_id", device.id).eq("held", false).select("username, password, created_at").maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        // Same login in another country within 30 minutes: warn admins (once per login every 6 hours).
        const loginNow = body.login || device.iptv_username;
        const here = (fields as { geo_country?: string | null }).geo_country ?? null;
        if (loginNow && here && device.user_id) {
          const { data: others } = await supabaseAdmin.from("player_devices").select("geo_country, last_seen_at")
            .eq("iptv_username", loginNow).neq("id", device.id).gte("last_seen_at", new Date(now - 30 * 60_000).toISOString()).limit(20);
          const away = unusualPlace(here, others ?? [], now);
          if (away) {
            const { count } = await supabaseAdmin.from("player_security_events").select("id", { count: "exact", head: true })
              .eq("kind", "unusual_place").eq("login", loginNow).gte("created_at", new Date(now - 6 * 3600_000).toISOString());
            if (!count) {
              await supabaseAdmin.from("player_security_events").insert({ kind: "unusual_place", device_id: device.id, owner_id: device.user_id, login: loginNow, detail: { countries: [here, away] } });
              const { notifyPlayerAdmins } = await import("@/lib/player-security.server");
              await notifyPlayerAdmins(supabaseAdmin, "Possible login sharing", `Login ${loginNow} is being used in ${here} and ${away} at the same time.`);
            }
          }
        }
        // A poll that is about to hand the app its login must never wait on an
        // outside lookup; every later poll can pay for a fresh VPN verdict.
        if (!pending && needsVpnCheck({ ip, checkedAt: device.vpn_checked_at, status: device.vpn_status, now })) {
          Object.assign(fields, await checkDeviceVpn(ip as string));
        }
        await supabaseAdmin.from("player_devices").update(fields).eq("id", device.id);
        // Weekly viewing hours: credit the gap since the last check-in to what was playing then.
        // Live TV previews are never credited — only real playback counts.
        const { watchCredit } = await import("@/lib/player-live");
        const credit = device.watching_preview
          ? null
          : watchCredit({ now, lastSeenAt: device.last_seen_at, watchingKind: device.watching_kind });
        if (credit) await supabaseAdmin.rpc("add_player_watch_seconds", { _device: device.id, _kind: credit.kind, _seconds: credit.seconds });
        const { watchActivityCredit } = await import("@/lib/player-watch-activity");
        const activity = watchActivityCredit(device, credit, now);
        if (activity) await supabaseAdmin.rpc("record_player_watch_activity", activity);
        const fresh = pending && Date.now() - new Date(pending.created_at).getTime() < PENDING_CREDENTIAL_TTL_MS;
        return json({
          linked: !!(device.user_id || device.offsite_customer_id),
          dns: settings?.dns ?? "",
          credentials: fresh ? { username: pending.username, password: pending.password } : null,
          report_url: "https://bmsupport.uk/tickets",
          // Apps multiply their check-in timers by this (1 = normal) to ease load during busy events.
          slow: checkinSlowdown(settings?.checkin_slowdown),
          maintenance: {
            enabled: !!settings?.maintenance_enabled,
            message: settings?.maintenance_message || "BM Player is down for maintenance. Please try again soon.",
          },
        });
      },
    },
  },
});
