import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LINK_CODE_TTL_MS, PENDING_CREDENTIAL_TTL_MS } from "@/lib/player-link";
import { createSharedCache } from "@/lib/player-sports-cache";
import { RatingTitle, RatingVote, ratingIdentity, ratingVoter } from "@/lib/player-ratings";
import { announcementMatchesUser } from "@/lib/player-announcement-audience";
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
  z.object({ action: z.literal("sports"), device_token: Token }),
  z.object({ action: z.literal("announcement"), device_token: Token }),
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
let announcementCache: { at: number; value: { id: string; message: string; sent_at: number; target_user_id: string | null } | null } | null = null;
async function currentAnnouncement(admin: { from: (t: "player_announcements") => any }) {
  if (announcementCache && Date.now() - announcementCache.at < 10_000) return announcementCache.value;
  const { data, error } = await admin.from("player_announcements").select("id, message, created_at, target_user_id").eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return announcementCache?.value ?? null;
  let row = data;
  // One-off: delivered to players open in the first few minutes, then ended so it is never sent again.
  if (row && Date.now() - Date.parse(row.created_at) > ANNOUNCEMENT_WINDOW_MS) {
    await admin.from("player_announcements").update({ active: false, ended_at: new Date().toISOString() }).eq("id", row.id);
    row = null;
  }
  announcementCache = { at: Date.now(), value: row ? { id: row.id, message: row.message, sent_at: Date.parse(row.created_at), target_user_id: row.target_user_id } : null };
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

        const { data: device } = await supabaseAdmin.from("player_devices").select("id, user_id, offsite_customer_id, last_seen_at, connected_since, vpn_status, vpn_checked_at, watching_kind, watching_title, watching_category, watching_since, watching_preview, platform")
          .eq("token_hash", await sha256Hex(body.device_token)).maybeSingle();
        if (!device) return json({ error: "Unknown device" }, 401);

        if (body.action === "announcement") {
          // Apps ask every few seconds; one shared read per 10s keeps this cheap for any number of players.
          // age_ms lets apps compare against their own start time without trusting the device clock;
          // announcements only reach apps that were already open when it was sent.
          const a = await currentAnnouncement(supabaseAdmin);
          const visible = a && announcementMatchesUser(a.target_user_id, device);
          return json({ announcement: visible ? { id: a.id, message: a.message, age_ms: Math.max(0, Date.now() - a.sent_at) } : null });
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

        if (body.action === "unlock") {
          if (!device.user_id && !device.offsite_customer_id) return json({ error: "Link this app to your BM Support account first." }, 403);
          const { data: lock } = await supabaseAdmin.from("player_devices").select("unlock_failures, unlock_locked_until").eq("id", device.id).single();
          if (lock?.unlock_locked_until && new Date(lock.unlock_locked_until).getTime() > Date.now())
            return json({ error: "Too many wrong tries. Please wait 15 minutes and try again." }, 429);
          const { data: cn } = device.user_id
            ? await supabaseAdmin.from("customer_numbers").select("number").eq("user_id", device.user_id).maybeSingle()
            : await supabaseAdmin.from("player_offsite_customers").select("number").eq("id", device.offsite_customer_id as string).maybeSingle();
          if (cn && String(cn.number) === body.account_number) {
            await supabaseAdmin.from("player_devices").update({ unlock_failures: 0, unlock_locked_until: null }).eq("id", device.id);
            return json({ ok: true });
          }
          const fails = (lock?.unlock_failures ?? 0) + 1;
          const locked = fails >= 5;
          await supabaseAdmin.from("player_devices").update({
            unlock_failures: locked ? 0 : fails,
            unlock_locked_until: locked ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
          }).eq("id", device.id);
          return json({ error: locked ? "Too many wrong tries. Please wait 15 minutes and try again." : "That account number isn't right. You can find it in your subscription box on bmsupport.uk." }, locked ? 429 : 401);
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
          const { count } = await supabaseAdmin.from("tickets").select("id", { count: "exact", head: true })
            .eq("user_id", device.user_id).like("subject", "BM Player:%").gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
          if ((count ?? 0) >= 3) return json({ error: "You've just sent a few reports. Our staff will be with you shortly." }, 429);
          const slug = body.kind === "live" ? "live-tv" : "movies-series";
          const { data: cat } = await supabaseAdmin.from("ticket_categories").select("id").eq("slug", slug).maybeSingle();
          if (!cat) return json({ error: "Couldn't open a ticket. Try again." }, 503);
          const label = body.kind === "live" ? "Channel" : body.kind === "film" ? "Film" : "Series";
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

        if (body.action === "sports") {
          const payload = await sportsCache(async () => {
            const [{ data: blogs }, { data: cats }, { data: st }] = await Promise.all([
              supabaseAdmin.from("sports_blogs").select("title, body, category_id, updated_at, sort_order, created_at").eq("published", true).order("sort_order").order("created_at", { ascending: false }),
              supabaseAdmin.from("sports_categories").select("id, name, parent_id, sort_order").order("sort_order"),
              supabaseAdmin.from("player_settings").select("channel_aliases").eq("id", 1).maybeSingle(),
            ]);
            const { playerSportsEvents } = await import("@/lib/player-sports");
            const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
            const parentOf = new Map((cats ?? []).map((c) => [c.id, c.parent_id]));
            const events = playerSportsEvents((blogs ?? []).map((b) => {
              const pid = b.category_id ? parentOf.get(b.category_id) : null;
              return { title: b.title, body: b.body, category: b.category_id ? catName.get(b.category_id) ?? null : null, parent: pid ? catName.get(pid) ?? null : null };
            }));
            const version = (blogs ?? []).reduce((m, b) => (b.updated_at > m ? b.updated_at : m), "") + ":" + events.length;
            // Guides follow the website order too (sort_order, newest first), after the category names.
            const order = Array.from(new Set([...(cats ?? []).map((c) => c.name), ...(blogs ?? []).map((b) => b.title)]));
            // Category pop-up: the website's own main categories, each with its sub-categories, in site order.
            const categories = (cats ?? []).filter((c) => !c.parent_id).map((c) => ({ name: c.name, subs: (cats ?? []).filter((x) => x.parent_id === c.id).map((x) => x.name) }));
            return { version, events, order, categories, aliases: Array.isArray(st?.channel_aliases) ? st.channel_aliases : [] };
          });
          return json(payload);
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
        const [{ data: settings }, { data: pending }] = await Promise.all([
          supabaseAdmin.from("player_settings").select("dns, maintenance_enabled, maintenance_message").eq("id", 1).maybeSingle(),
          supabaseAdmin.from("player_pending_credentials").delete().eq("device_id", device.id).select("username, password, created_at").maybeSingle(),
        ]);
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
          maintenance: {
            enabled: !!settings?.maintenance_enabled,
            message: settings?.maintenance_message || "BM Player is down for maintenance. Please try again soon.",
          },
        });
      },
    },
  },
});
