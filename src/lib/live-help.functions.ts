import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { unlock } from "@/lib/checkout.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Live "Show Us" camera help sessions, scoped to the secure order pages.
 * Customer calls are gated by the order's token + password (same as checkout).
 * Staff calls require an authenticated admin/management/staff role.
 * Video itself is peer-to-peer (WebRTC) signalled over a per-session realtime
 * broadcast channel — nothing is recorded or stored.
 */

const creds = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().max(64).default(""),
});

const SESSION_TTL_MS = 30 * 60 * 1000;

type SessionRow = {
  id: string;
  order_id: string;
  status: string;
  requested_at: string;
  joined_at: string | null;
  joined_by: string | null;
  ended_at: string | null;
  ended_by: string | null;
  staff_note: string | null;
};

function toSession(r: SessionRow) {
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    status: String(r.status) as "waiting" | "live" | "ended" | "expired",
    requestedAt: String(r.requested_at),
    joinedAt: r.joined_at ? String(r.joined_at) : null,
    endedAt: r.ended_at ? String(r.ended_at) : null,
    staffNote: r.staff_note ? String(r.staff_note) : null,
  };
}

/** Marks sessions older than 30 minutes as expired (lazy housekeeping). */
async function expireStale(supabaseAdmin: any, orderId: string) {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  await supabaseAdmin
    .from("order_support_sessions")
    .update({ status: "expired", ended_at: new Date().toISOString(), ended_by: "timeout" })
    .eq("order_id", orderId)
    .in("status", ["waiting", "live"])
    .lt("requested_at", cutoff);
}

async function latestOpenSession(supabaseAdmin: any, orderId: string): Promise<SessionRow | null> {
  const { data } = await supabaseAdmin
    .from("order_support_sessions")
    .select("*")
    .eq("order_id", orderId)
    .in("status", ["waiting", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SessionRow | null) ?? null;
}

async function requireStaff(context: { supabase: any; userId: string }) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(roles ?? []).some(({ role }: { role: string }) => ["admin", "management", "staff"].includes(String(role)))) {
    throw new Error("Forbidden");
  }
}

/** Customer requests (or re-joins) a live help session for their order. */
export const startLiveHelp = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const };
    const { supabaseAdmin, link } = u;
    await expireStale(supabaseAdmin, link.order_id);
    const existing = await latestOpenSession(supabaseAdmin, link.order_id);
    if (existing) return { ok: true as const, session: toSession(existing) };

    const { data: row, error } = await supabaseAdmin
      .from("order_support_sessions")
      .insert({ order_id: link.order_id })
      .select("*")
      .single();
    if (error || !row) return { ok: false as const };

    // Urgent, unthrottled: a customer is waiting live for help.
    try {
      await supabaseAdmin.from("staff_notifications").insert({
        kind: "live_help",
        title: "Live help requested — customer waiting",
        body: "A customer has requested live camera help with their order. Open the secure page and join.",
        link_path: `/admin-secure-page?order=${link.order_id}`,
        entity_id: link.order_id,
      } as never);
    } catch (e) {
      console.error("Live help staff alert failed:", e);
    }
    return { ok: true as const, session: toSession(row as SessionRow) };
  });

/** Customer polls their open session + chat messages. */
export const getLiveHelp = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const, session: null, messages: [] };
    const { supabaseAdmin, link } = u;
    await expireStale(supabaseAdmin, link.order_id);
    const session = await latestOpenSession(supabaseAdmin, link.order_id);
    if (!session) return { ok: true as const, session: null, messages: [] };
    const { data: rows } = await supabaseAdmin
      .from("order_support_session_messages")
      .select("id,sender,content,created_at")
      .eq("session_id", session.id)
      .order("created_at")
      .limit(200);
    return {
      ok: true as const,
      session: toSession(session),
      messages: (rows ?? []) as { id: string; sender: string; content: string; created_at: string }[],
    };
  });

/** Customer sends a chat message inside a session. */
export const sendLiveHelpChat = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    creds.extend({ sessionId: z.string().uuid(), content: z.string().trim().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const };
    const { data: session } = await u.supabaseAdmin
      .from("order_support_sessions")
      .select("id,status")
      .eq("id", data.sessionId)
      .eq("order_id", u.link.order_id)
      .in("status", ["waiting", "live"])
      .maybeSingle();
    if (!session) return { ok: false as const };
    const { error } = await u.supabaseAdmin
      .from("order_support_session_messages")
      .insert({ session_id: data.sessionId, sender: "customer", content: data.content });
    if (error) return { ok: false as const };
    return { ok: true as const };
  });

/** Customer ends/stops their session. */
export const endLiveHelpCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.extend({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const u = await unlock(data.token, data.password);
    if (!u) return { ok: false as const };
    await u.supabaseAdmin
      .from("order_support_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString(), ended_by: "customer" })
      .eq("id", data.sessionId)
      .eq("order_id", u.link.order_id)
      .in("status", ["waiting", "live"]);
    return { ok: true as const };
  });

/** Staff: list recent sessions for an order (newest first). */
export const listOrderLiveHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await expireStale(supabaseAdmin, data.orderId);
    const { data: rows, error } = await supabaseAdmin
      .from("order_support_sessions")
      .select("*")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return { sessions: (rows ?? []).map((r) => toSession(r as SessionRow)) };
  });

/** Staff: join a waiting session (marks it live). */
export const joinLiveHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("order_support_sessions")
      .update({ status: "live", joined_at: new Date().toISOString(), joined_by: context.userId })
      .eq("id", data.sessionId)
      .eq("status", "waiting")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      const { data: existing } = await supabaseAdmin
        .from("order_support_sessions")
        .select("*")
        .eq("id", data.sessionId)
        .maybeSingle();
      if (!existing || !["live", "waiting"].includes(String(existing.status))) throw new Error("This session has ended");
      return { session: toSession(existing as SessionRow) };
    }
    return { session: toSession(row as SessionRow) };
  });

/** Staff: chat messages for a session. */
export const getLiveHelpStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: session }, { data: rows }] = await Promise.all([
      supabaseAdmin.from("order_support_sessions").select("*").eq("id", data.sessionId).maybeSingle(),
      supabaseAdmin
        .from("order_support_session_messages")
        .select("id,sender,content,created_at")
        .eq("session_id", data.sessionId)
        .order("created_at")
        .limit(200),
    ]);
    if (!session) throw new Error("Session not found");
    return {
      session: toSession(session as SessionRow),
      messages: (rows ?? []) as { id: string; sender: string; content: string; created_at: string }[],
    };
  });

export const sendLiveHelpChatStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sessionId: z.string().uuid(), content: z.string().trim().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("order_support_session_messages")
      .insert({ session_id: data.sessionId, sender: "staff", content: data.content });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Staff: end a session, optionally saving a note against the order. */
export const endLiveHelpStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sessionId: z.string().uuid(), note: z.string().trim().max(2000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("order_support_sessions")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        ended_by: "staff",
        staff_note: data.note || null,
      })
      .eq("id", data.sessionId)
      .in("status", ["waiting", "live"]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Staff: send the customer a WhatsApp invite with their secure order link. */
export const sendLiveHelpWhatsAppInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        phone: z.string().regex(/^\d{7,15}$/, "Enter the number in international format, digits only"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
    if (!LOVABLE_API_KEY || !WHATSAPP_API_KEY) {
      throw new Error("WhatsApp isn't connected to BM Support yet — connect it first, or send the customer their secure page link another way.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin
      .from("order_checkout_links")
      .select("token")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (!link?.token) throw new Error("This order has no secure page link yet");
    const url = `https://bmsupport.uk/pay/${link.token}`;
    const response = await fetch("https://connector-gateway.lovable.dev/whatsapp/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": WHATSAPP_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: data.phone,
        type: "text",
        text: {
          body: `BM Support: we're ready to help you live. Tap this link to open your secure order page, press "Get Live Help", and point your phone camera at your device so we can see what's happening: ${url}`,
        },
      }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${body}`);
    let providerId: string | null = null;
    try {
      providerId = JSON.parse(body)?.messages?.[0]?.id ?? null;
    } catch { /* ignore */ }
    return { ok: true as const, providerId };
  });
