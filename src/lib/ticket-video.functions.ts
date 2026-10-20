import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canUseVideoCommand, videoInviteMessage } from "@/lib/video-call-access";

/**
 * Ticket video calls started by the staff "/video" chat command. Staff post a
 * QR code into the ticket; the customer scans it on their phone (no sign-in
 * needed — the link carries a one-off token) and the call uses the same
 * multi-staff setup as secure-order video help.
 * Statuses: ringing (invite sent) → waiting (customer started) → live → ended/missed.
 */

const INVITE_TTL_MS = 30 * 60 * 1000;
const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function staffRoles(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => String(r.role));
  if (!canUseVideoCommand(roles)) throw new Error("Only admin, management and staff can use /video");
  return roles;
}

type CallRow = { id: string; ticket_id: string; status: string; invite_expires_at: string | null; created_at: string };

function toCall(r: CallRow) {
  return { id: String(r.id), ticketId: String(r.ticket_id), status: String(r.status) as "ringing" | "waiting" | "live" | "ended" | "missed" };
}

/** Staff: "/video" — create the invite and post the QR message to the ticket. */
export const createTicketVideoInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await staffRoles(context);
    const { data: ticket } = await context.supabase.from("tickets").select("id,status").eq("id", data.ticketId).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ticket.status === "closed") throw new Error("Ticket is closed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    // One open invite per ticket: older unanswered ones stop working.
    await supabaseAdmin.from("ticket_video_calls").update({ status: "missed", ended_at: now }).eq("ticket_id", data.ticketId).in("status", ["ringing", "waiting"]);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: row, error } = await supabaseAdmin
      .from("ticket_video_calls")
      .insert({
        ticket_id: data.ticketId,
        started_by: context.userId,
        status: "ringing",
        invite_token_hash: await sha256(token),
        invite_expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      } as never)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Couldn't create the video call");
    const { error: msgErr } = await context.supabase.from("ticket_messages").insert({
      ticket_id: data.ticketId,
      sender_id: context.userId,
      content: videoInviteMessage(token),
      is_internal: false,
    });
    if (msgErr) throw new Error(msgErr.message);
    return { id: String((row as { id: string }).id) };
  });

async function byToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ticket_video_calls").select("*").eq("invite_token_hash", await sha256(token)).maybeSingle();
  return { supabaseAdmin, call: (data as CallRow | null) ?? null };
}

/** Customer phone (no sign-in): read the invite's state. */
export const getTicketVideoByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, call } = await byToken(data.token);
    if (!call) return { ok: false as const, reason: "missing" as const };
    const expired = call.status === "ringing" && call.invite_expires_at && new Date(call.invite_expires_at).getTime() < Date.now();
    if (expired) {
      await supabaseAdmin.from("ticket_video_calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", call.id).eq("status", "ringing");
      return { ok: false as const, reason: "expired" as const };
    }
    const { data: open } = await supabaseAdmin.rpc("is_business_open");
    return { ok: true as const, call: toCall(call), businessOpen: open !== false };
  });

/** Customer phone: start the call (staff are alerted to join). */
export const startTicketVideoByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, call } = await byToken(data.token);
    if (!call || !["ringing", "waiting", "live"].includes(call.status)) return { ok: false as const, reason: "ended" as const };
    if (call.status === "ringing") {
      if (call.invite_expires_at && new Date(call.invite_expires_at).getTime() < Date.now()) return { ok: false as const, reason: "expired" as const };
      const { data: open } = await supabaseAdmin.rpc("is_business_open");
      if (open === false) return { ok: false as const, reason: "closed" as const };
      await supabaseAdmin.from("ticket_video_calls").update({ status: "waiting" }).eq("id", call.id).eq("status", "ringing");
      const { data: t } = await supabaseAdmin.from("tickets").select("subject").eq("id", call.ticket_id).maybeSingle();
      try {
        await supabaseAdmin.from("staff_notifications").insert({
          kind: "live_help",
          title: "Video call — customer waiting",
          body: `A customer is waiting on a video call from ticket "${(t as { subject?: string } | null)?.subject ?? ""}". Open the ticket to join.`,
          link_path: `/tickets?id=${call.ticket_id}`,
          entity_id: call.ticket_id,
        } as never);
      } catch (e) {
        console.error("Ticket video alert failed:", e);
      }
      return { ok: true as const, call: { ...toCall(call), status: "waiting" as const } };
    }
    return { ok: true as const, call: toCall(call) };
  });

/** Customer phone: hang up. */
export const endTicketVideoByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, call } = await byToken(data.token);
    if (!call) return { ok: true as const };
    await supabaseAdmin.from("ticket_video_calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", call.id).in("status", ["ringing", "waiting", "live"]);
    return { ok: true as const };
  });

/** Staff: the ticket's open video call, if any. */
export const getTicketVideoCallStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await staffRoles(context);
    const { data: row } = await context.supabase
      .from("ticket_video_calls")
      .select("id,ticket_id,status,invite_expires_at,created_at")
      .eq("ticket_id", data.ticketId)
      .in("status", ["waiting", "live"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { call: row ? toCall(row as CallRow) : null };
  });

/** Staff: join (or rejoin) the call. */
export const joinTicketVideoCallStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ callId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await staffRoles(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("ticket_video_calls")
      .update({ status: "live", joined_by: context.userId, joined_at: new Date().toISOString() })
      .eq("id", data.callId)
      .eq("status", "waiting");
    const { data: row } = await supabaseAdmin.from("ticket_video_calls").select("id,ticket_id,status,invite_expires_at,created_at").eq("id", data.callId).maybeSingle();
    if (!row || !["waiting", "live"].includes(String(row.status))) throw new Error("This call has ended");
    return { call: toCall(row as CallRow) };
  });

/** Staff: end the call for everyone (only used when no other staff remain). */
export const endTicketVideoCallStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ callId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await staffRoles(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("ticket_video_calls")
      .update({ status: "ended", ended_at: new Date().toISOString(), ended_by: context.userId })
      .eq("id", data.callId)
      .in("status", ["ringing", "waiting", "live"]);
    return { ok: true as const };
  });
