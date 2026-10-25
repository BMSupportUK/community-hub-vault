import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { unlock } from "@/lib/checkout.server";

/**
 * Customer Remote setup on a secure order — same steps and proofs as the ticket
 * Remote setup tab. The customer proves access with the order link + password;
 * ticks only come from BM TV Enabler reports and BM Remote Helper's live code.
 */
const Access = z.object({ token: z.string().min(8).max(200), password: z.string().min(1).max(200) });
const COLS = "device, app_checks, app_checked_at, completed_at";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function open(token: string, password: string) {
  const u = await unlock(token, password);
  if (!u) throw new Error("Your order could not be checked. Refresh and try again.");
  return { db: u.supabaseAdmin, orderId: u.link.order_id as string };
}

export const getOrderRemoteSetup = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.parse(d))
  .handler(async ({ data }) => {
    const { db, orderId } = await open(data.token, data.password);
    const { data: row } = await db.from("order_remote_setup").select(COLS).eq("order_id", orderId).maybeSingle();
    return (row ?? null) as { device: "amazon" | "android"; app_checks: Record<string, boolean> | null; app_checked_at: string | null; completed_at: string | null } | null;
  });

export const saveOrderRemoteSetup = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.extend({ device: z.enum(["amazon", "android"]) }).parse(d))
  .handler(async ({ data }) => {
    const { db, orderId } = await open(data.token, data.password);
    const { error } = await db.from("order_remote_setup").upsert({
      order_id: orderId, device: data.device, app_checks: {}, app_checked_at: null, completed_at: null,
      verified_session_id: null, setup_code_hash: null, setup_code_expires_at: null, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Could not save your device");
    return { ok: true };
  });

export const issueOrderSetupCode = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.parse(d))
  .handler(async ({ data }) => {
    const { db, orderId } = await open(data.token, data.password);
    const n = new Uint32Array(1); crypto.getRandomValues(n);
    const code = String(n[0] % 100_000_000).padStart(8, "0");
    const { data: rows, error } = await db.from("order_remote_setup").update({
      setup_code_hash: await sha256Hex(code), setup_code_expires_at: new Date(Date.now() + 2 * 3600_000).toISOString(), updated_at: new Date().toISOString(),
    }).eq("order_id", orderId).select("order_id");
    if (error || !rows?.length) throw new Error("Choose your device first");
    return code;
  });

/** Live Helper code: confirms setup, links the TV to this order and alerts staff (same as tickets). */
export const verifyOrderRemoteSetup = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.extend({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { db, orderId } = await open(data.token, data.password);
    const { data: r } = await db.from("order_remote_setup").select("app_checks").eq("order_id", orderId).maybeSingle();
    if (!r) return { ok: false as const, error: "Choose your device first." };
    const c = (r.app_checks ?? {}) as Record<string, boolean>;
    if (!(c.adb && c.helper && c.accessibility)) return { ok: false as const, error: "BM TV Enabler has not confirmed your TV yet. Run Turn on remote control in the app first." };
    const failKind = `setup_code_failed:${orderId}`;
    const { count } = await db.from("tv_remote_events").select("id", { count: "exact", head: true }).eq("kind", failKind).gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
    if ((count ?? 0) >= 8) return { ok: false as const, error: "Too many wrong codes. Wait 15 minutes." };
    const { data: s } = await db.from("tv_remote_sessions").select("id, device_name")
      .eq("code_hash", await sha256Hex(data.code)).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!s) {
      await db.from("tv_remote_events").insert({ kind: failKind });
      return { ok: false as const, error: "That code isn't live. Check BM Remote Helper is open on the TV and try the code it shows now." };
    }
    await db.from("order_remote_setup").update({ completed_at: new Date().toISOString(), verified_session_id: s.id, updated_at: new Date().toISOString() }).eq("order_id", orderId);
    const { data: live } = await db.from("tv_remote_sessions").select("id").eq("link_kind", "order").eq("link_id", orderId)
      .in("status", ["pending", "claimed", "active"]).gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
    if (!live) {
      await db.from("tv_remote_sessions").update({ link_kind: "order", link_id: orderId, requested_at: new Date().toISOString() }).eq("id", s.id).is("link_id", null);
      await db.from("tv_remote_events").insert({ session_id: s.id, kind: "customer_requested" });
      const { data: o } = await db.from("orders").select("order_ref, existing_username").eq("id", orderId).maybeSingle();
      await db.from("staff_notifications").insert({
        kind: "tv_help", title: "Order screen share ready",
        body: `${o?.existing_username || "A customer"} confirmed their TV on sale ${o?.order_ref ?? ""}.`.trim(),
        link_path: `/admin-secure-page?order=${orderId}&tab=screen`, entity_id: s.id,
      });
    }
    return { ok: true as const };
  });
