import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { unlock } from "@/lib/checkout.server";

/**
 * Customer Remote setup on a secure order — same steps and proofs as the ticket
 * Remote setup tab. The customer proves access with the order link + password;
 * ticks only come from BM TV Enabler reports and BM Remote Helper's live code.
 */
const Access = z.object({ token: z.string().min(8).max(200), password: z.string().min(1).max(200) });
const COLS = "device, app_checks, app_checked_at, completed_at, checks_used_at, pending_session_id";

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
    return (row ?? null) as { device: "amazon" | "android"; app_checks: Record<string, boolean> | null; app_checked_at: string | null; completed_at: string | null; checks_used_at: string | null; pending_session_id: string | null } | null;
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

/** Restart: clears the saved setup so the customer can run the steps again from device choice. */
export const resetOrderRemoteSetup = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.parse(d))
  .handler(async ({ data }) => {
    const { db, orderId } = await open(data.token, data.password);
    await db.from("order_remote_setup").delete().eq("order_id", orderId);
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

/** Code shown by BM TV Enabler: reusable on this order until its original expiry. */
export const redeemOrderEnablerCode = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.extend({ code: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { normalizeConfirmCode, confirmCodeState } = await import("@/lib/enabler-confirm-code");
    const { db, orderId } = await open(data.token, data.password);
    const { data: setup } = await db.from("order_remote_setup").select("device").eq("order_id", orderId).maybeSingle();
    if (!setup) return { ok: false as const, error: "Choose your device first." };
    const failKind = `enabler_code_failed:${orderId}`;
    const { count } = await db.from("tv_remote_events").select("id", { count: "exact", head: true }).eq("kind", failKind).gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
    if ((count ?? 0) >= 8) return { ok: false as const, error: "Too many wrong codes. Wait 15 minutes." };
    const hash = await sha256Hex(normalizeConfirmCode(data.code));
    const { data: c } = await db.from("enabler_confirm_codes").select("device, checks, expires_at, used_at, session_id").eq("code_hash", hash).maybeSingle();
    const state = confirmCodeState(c, setup.device);
    if (state === "invalid") { await db.from("tv_remote_events").insert({ kind: failKind }); return { ok: false as const, error: "That code isn't valid. Check BM TV Enabler and type the code it shows now." }; }
    if (state === "device_mismatch") return { ok: false as const, error: "BM TV Enabler was set up for the other TV type. Press Change device, or pick the other TV type in the app." };
    const { data: result, error } = await db.rpc("redeem_order_enabler_code", { _order_id: orderId, _code_hash: hash });
    if (error) throw new Error("Could not confirm your TV. Try again.");
    if (result !== "ok") return { ok: false as const, error: result === "scope_mismatch" ? "That code belongs to another ticket or order. Get a new code in BM TV Enabler." : "That code has expired. Press New code in BM TV Enabler." };
    return { ok: true as const };
  });

export const requestOrderEnablerConnection = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.parse(d))
  .handler(async ({ data }) => {
    const { db, orderId } = await open(data.token, data.password);
    const { data: result, error } = await db.rpc("request_enabler_connection", { _kind: "order", _id: orderId });
    if (error) throw new Error("Could not request a new connection.");
    return String(result);
  });

/** Consume only the fresh connection delivered automatically by Enabler. */
export const verifyOrderRemoteSetup = createServerFn({ method: "POST" })
  .inputValidator((d) => Access.parse(d))
  .handler(async ({ data }) => {
    const { db, orderId } = await open(data.token, data.password);
    const { data: connected, error } = await db.rpc("consume_enabler_connection", { _kind: "order", _id: orderId });
    if (error) throw new Error("Could not connect your TV. Please try again.");
    if (!connected) return { ok: false as const, error: "Press Get new connection and keep BM TV Enabler open. Each screen share needs a new TV connection." };
    return { ok: true as const };
  });
