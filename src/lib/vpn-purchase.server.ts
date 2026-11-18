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
  const q = vpnProRata(cred?.expiry_at as string | null, nowMs);
  if (!q) return { ok: false, reason: "Your subscription has no end date we can match the VPN to. Message BM Support to add it." };
  if (q.pence < VPN_MIN_PENCE) return { ok: false, reason: `Your subscription ends in ${q.days} day${q.days === 1 ? "" : "s"}. Renew first, then add the VPN for the new period.` };
  return { ok: true, ...q, credentialId, userId: device.user_id };
}

const payUrl = (token: string, password: string) => `https://bmsupport.uk/vpn-pay/${token}#${encodeURIComponent(password)}`;

/** Reuse this box's unpaid VPN order from the last 6 hours (same price), otherwise make a new one. */
export async function vpnBuy(device: Device) {
  const q = await vpnQuote(device);
  if (!q.ok) return { error: q.reason };
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: prev } = await supabaseAdmin.from("vpn_purchases").select("order_id, pence").eq("device_id", device.id).is("completed_at", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (prev && prev.pence === q.pence) {
    const [{ data: o }, { data: l }] = await Promise.all([
      supabaseAdmin.from("orders").select("paid_at, status").eq("id", prev.order_id).maybeSingle(),
      supabaseAdmin.from("order_checkout_links").select("token, password").eq("order_id", prev.order_id).maybeSingle(),
    ]);
    if (o && !o.paid_at && o.status !== "cancelled" && l) return { url: payUrl(l.token, l.password), pence: q.pence, days: q.days, until: q.until };
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
  return { url: payUrl(token, password), pence: q.pence, days: q.days, until: q.until };
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
