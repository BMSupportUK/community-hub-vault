import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { VPN_MIN_PENCE, vpnAppLineName, vpnProRata } from "./vpn-addon";

/**
 * VPN bought inside BM Player only. The box asks for a quote, then a pay link (shown as a QR code);
 * the customer pays on their phone and the order completes itself, which switches the VPN on until the
 * subscription's own end date (vpn_on_order_complete trigger).
 */
type Device = { id: string; user_id: string | null };

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const pw = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("").replace(/(.{4})(?=.)/g, "$1-");

export type VpnQuote =
  | { ok: true; days: number; pence: number; until: string; credentialId: string; userId: string }
  | { ok: false; reason: string };

export async function vpnQuote(device: Device, nowMs = Date.now()): Promise<VpnQuote> {
  if (!device.user_id) return { ok: false, reason: "Link this box to your bmsupport.uk account first, then you can add the VPN here." };
  const { data: dev } = await supabaseAdmin.from("player_devices").select("credential_id").eq("id", device.id).maybeSingle();
  const credentialId = dev?.credential_id as string | null;
  if (!credentialId) return { ok: false, reason: "Sign in with your subscription login first." };
  const { data: cred, error: expiryError } = await supabaseAdmin.rpc("vpn_credential_expiry", { p_credential: credentialId }).maybeSingle();
  if (expiryError) return { ok: false, reason: "Couldn't check your subscription end date. Try again shortly." };
  if (!cred || cred.owner_id !== device.user_id) return { ok: false, reason: "Sign in with your subscription login first." };
  const { vpnEntitlement } = await import("./vpnresellers.server");
  const covered = await vpnEntitlement(credentialId, device.user_id).catch(() => null);
  if (covered) {
    const { vpnHolder } = await import("./vpnresellers.server");
    const holder = await vpnHolder(device.user_id).catch(() => null);
    const until = new Date(covered.until).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (!holder || holder === device.id) return { ok: false, reason: `You already have the VPN on this device until ${until}. Switch it on from the home screen.` };
    const { data: h } = await supabaseAdmin.from("player_devices").select("name, nickname").eq("id", holder).maybeSingle();
    return { ok: false, reason: `Your VPN works on 1 device at a time and is on "${h?.nickname || h?.name || "another device"}" until ${until}. To use it here, go to bmsupport.uk › Shop › VPN and press "Move VPN here".` };
  }
  const q = vpnProRata(cred?.expiry_at as string | null, nowMs);
  if (!q) return { ok: false, reason: "Your subscription has no end date we can match the VPN to. Message BM Support to add it." };
  if (q.pence < VPN_MIN_PENCE) return { ok: false, reason: `Your subscription ends in ${q.days} day${q.days === 1 ? "" : "s"}. Renew first, then add the VPN for the new period.` };
  return { ok: true, ...q, credentialId, userId: device.user_id };
}

const payUrl = (token: string, password: string) => `https://bmsupport.uk/vpn-pay/${token}#${encodeURIComponent(password)}`;

const INTENT_MS = 6 * 3600e3;
async function intentSig(deviceId: string, exp: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("VPN link signing is unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`vpn-intent:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${deviceId}.${exp}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get VPN on the box only makes a signed "ask to buy" link — no order exists yet. The order is created
 * only when the customer presses Confirm on the pay page, so opening Get VPN never leaves false orders.
 */
export async function vpnBuy(device: Device) {
  const q = await vpnQuote(device);
  if (!q.ok) return { error: q.reason };
  const exp = (Date.now() + INTENT_MS).toString(36);
  // Only letters, digits and hyphens: Windows/Mac 0.4.115/0.1.116 reject pay links with any other character.
  return { url: payUrl(await intentSig(device.id, exp), `i-${device.id}-${exp}`), pence: q.pence, days: q.days, until: q.until };
}

/** Device id for a valid, unexpired "ask to buy" link, else null. */
export async function vpnIntentDevice(token: string, password: string, nowMs = Date.now()): Promise<string | null> {
  const m = /^i[.-]([0-9a-f-]{36})[.-]([0-9a-z]+)$/.exec(password);
  if (!m || parseInt(m[2], 36) < nowMs) return null;
  const want = await intentSig(m[1], m[2]);
  let diff = want.length ^ token.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (token.charCodeAt(i) || 0);
  return diff === 0 ? m[1] : null;
}

export async function vpnIntentDeviceRow(deviceId: string): Promise<Device | null> {
  const { data } = await supabaseAdmin.from("player_devices").select("id, user_id").eq("id", deviceId).maybeSingle();
  return data ? { id: String(data.id), user_id: (data.user_id as string | null) ?? null } : null;
}

/** After the customer confirms: reuse this box's unpaid VPN order from the last 6 hours (same price), otherwise make one. */
export async function vpnCreateOrder(device: Device) {
  const q = await vpnQuote(device);
  if (!q.ok) return { error: q.reason };
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: prev } = await supabaseAdmin.from("vpn_purchases").select("order_id, pence").eq("device_id", device.id).is("completed_at", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (prev && prev.pence === q.pence) {
    const [{ data: o }, { data: l }] = await Promise.all([
      supabaseAdmin.from("orders").select("paid_at, status").eq("id", prev.order_id).maybeSingle(),
      supabaseAdmin.from("order_checkout_links").select("token, password").eq("order_id", prev.order_id).maybeSingle(),
    ]);
    if (o && !o.paid_at && o.status !== "cancelled" && l) return { token: l.token as string, password: l.password as string, url: payUrl(l.token, l.password), pence: q.pence, days: q.days, until: q.until };
  }
  const { data: prof } = await supabaseAdmin.from("profiles").select("display_name, username").eq("id", q.userId).maybeSingle();
  const { data: order, error } = await supabaseAdmin.from("orders").insert({
    user_id: q.userId, total_cents: q.pence, customer_type: "vpn", credential_id: q.credentialId,
    shipping_name: prof?.display_name || prof?.username || null,
  } as never).select("id").single();
  if (error || !order) throw new Error(error?.message ?? "Could not start the VPN order");
  const orderId = (order as { id: string }).id;
  const { error: ie } = await supabaseAdmin.from("order_items").insert({ order_id: orderId, product_id: null, product_name: vpnAppLineName(q.days), unit_price_cents: q.pence, quantity: 1 } as never);
  if (ie) throw new Error(ie.message);
  const token = hex(32), password = pw();
  const { error: le } = await supabaseAdmin.from("order_checkout_links").insert({
    order_id: orderId, token, password, customer_kind: "vpn", claimed_by: q.userId,
    account_setup_at: new Date().toISOString(), subscription_expiry_at: q.until,
  } as never);
  if (le) throw new Error(le.message);
  const { error: pe } = await supabaseAdmin.from("vpn_purchases").insert({ order_id: orderId, device_id: device.id, credential_id: q.credentialId, user_id: q.userId, days: q.days, pence: q.pence, paid_until: q.until } as never);
  if (pe) throw new Error(pe.message);
  return { token, password, url: payUrl(token, password), pence: q.pence, days: q.days, until: q.until };
}

/** Check card/bank payment for a VPN order and complete it once paid (which switches the VPN on). */
export async function vpnFinish(orderId: string): Promise<{ paid: boolean; completed: boolean }> {
  const { syncStripeSession } = await import("./checkout-pay.functions");
  try { await syncStripeSession(supabaseAdmin, orderId); } catch { /* checked again next time */ }
  const loc = process.env.SQUARE_LOCATION_ID;
  if (loc) { try { const { syncSquareCheckout } = await import("./square-checkout.server"); await syncSquareCheckout(supabaseAdmin, orderId, loc); } catch { /* ignore */ } }
  const { data: o } = await supabaseAdmin.from("orders").select("paid_at, completed_at, customer_type, status").eq("id", orderId).maybeSingle();
  if (!o || o.customer_type !== "vpn" || !o.paid_at) return { paid: false, completed: false };
  if (!o.completed_at) {
    const { error } = await supabaseAdmin.from("orders").update({ status: "completed", completed_at: new Date().toISOString() } as never).eq("id", orderId).is("completed_at", null);
    if (error) { console.error("[vpn] could not complete", orderId, error.message); return { paid: true, completed: false }; }
  }
  return { paid: true, completed: true };
}

/** The box's newest unfinished VPN order: completes it if the customer has paid. */
export async function vpnFinishForDevice(deviceId: string) {
  const { data: p } = await supabaseAdmin.from("vpn_purchases").select("order_id").eq("device_id", deviceId).is("completed_at", null).gte("created_at", new Date(Date.now() - 2 * 3600e3).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!p) return null;
  return vpnFinish(p.order_id as string);
}
