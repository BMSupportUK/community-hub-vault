import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { unlock } from "@/lib/checkout.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ORDER_SCREEN_SHARE_INVITE } from "@/lib/tv-remote";

export const inviteOrderScreenShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("has_any_role", { _user_id: context.userId, _roles: ["admin", "management", "staff"] });
    if (roleError || !allowed) throw new Error("Forbidden");
    const { error } = await context.supabase.from("checkout_chat_messages").insert({ order_id: data.orderId, sender: "staff", staff_id: context.userId, content: `Please connect your TV using the screen-sharing code box on this order. ${ORDER_SCREEN_SHARE_INVITE}` });
    if (error) throw new Error("Could not send screen share request");
    return { ok: true };
  });

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Customer on the secure checkout asks for screen-share help: links the TV's
 * pending helper request (by its 6-digit code) to this sale and alerts staff.
 */
export const requestCheckoutScreenShare = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(8).max(200), password: z.string().min(1).max(200), code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const, error: "Your order could not be checked. Refresh and try again." };
    const db = u.supabaseAdmin;
    const orderId = u.link.order_id as string;
    const failKind = `code_failed:${orderId}`;
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db.from("tv_remote_events").select("id", { count: "exact", head: true }).eq("kind", failKind).gte("created_at", since);
    if ((count ?? 0) >= 8) return { ok: false as const, error: "Too many wrong codes. Wait 10 minutes and try again." };
    const { data: s } = await db.from("tv_remote_sessions").select("id, device_name")
      .eq("code_hash", await sha256Hex(data.code)).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!s) {
      await db.from("tv_remote_events").insert({ kind: failKind });
      return { ok: false as const, error: "That code is wrong or has expired. Check the code on your TV." };
    }
    await db.from("tv_remote_sessions").update({ link_kind: "order", link_id: orderId, requested_at: new Date().toISOString() }).eq("id", s.id);
    await db.from("tv_remote_events").insert({ session_id: s.id, kind: "customer_requested" });
    const { data: o } = await db.from("orders").select("order_ref, existing_username").eq("id", orderId).maybeSingle();
    await db.from("staff_notifications").insert({
      kind: "tv_help", title: "Screen share help requested",
      body: `${o?.existing_username || "A customer"} on sale ${o?.order_ref ?? ""} wants help on their TV (${s.device_name}).`.trim(),
      link_path: `/screen-share/order/${orderId}`, entity_id: s.id,
    });
    return { ok: true as const };
  });

/** Customer: is there a live screen-share request on this sale? (survives leaving/returning) */
export const getCheckoutScreenShareStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(8).max(200), password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { status: null as string | null, invited: false };
    const { data: invite } = await u.supabaseAdmin.from("checkout_chat_messages").select("id").eq("order_id", u.link.order_id as string).eq("sender", "staff").not("staff_id", "is", null).like("content", `%${ORDER_SCREEN_SHARE_INVITE}%`).limit(1).maybeSingle();
    const { data: s } = await u.supabaseAdmin.from("tv_remote_sessions").select("status")
      .eq("link_kind", "order").eq("link_id", u.link.order_id as string).not("requested_at", "is", null)
      .in("status", ["pending", "claimed", "active"]).gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false }).limit(1).maybeSingle();
    return { status: (s?.status as string | undefined) ?? null, invited: !!invite };
  });
