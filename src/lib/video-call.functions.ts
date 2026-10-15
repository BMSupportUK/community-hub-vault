import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canAnswerTicketVideoCall, canStartTicketVideoCall } from "@/lib/video-call-access";

/**
 * Two-way live video help calls. Video/audio are peer-to-peer WebRTC,
 * signalled over a per-call realtime broadcast topic; nothing is recorded.
 * Only the call log row (who, when) is stored.
 */

/** ICE servers: public STUN plus an optional TURN relay configured by secrets. */
export const getVideoIceServers = createServerFn({ method: "POST" }).handler(async () => {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const urls = process.env["TURN_URLS"];
  const username = process.env["TURN_USERNAME"];
  const credential = process.env["TURN_CREDENTIAL"];
  if (urls && username && credential) {
    servers.push({ urls: urls.split(",").map((u) => u.trim()).filter(Boolean), username, credential });
  }
  // Cloudflare TURN relay: short-lived credentials so calls connect over mobile data.
  const cfKeyId = process.env["CF_TURN_KEY_ID"];
  const cfToken = process.env["CF_TURN_KEY_TOKEN"];
  if (cfKeyId && cfToken) {
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfKeyId}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (!res.ok) {
        console.error(`Cloudflare TURN failed [${res.status}]: ${await res.text()}`);
      } else {
        const j = (await res.json()) as { iceServers?: typeof servers | (typeof servers)[number] };
        const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
        servers.push(...list);
      }
    } catch (e) {
      console.error("Cloudflare TURN error:", e);
    }
  }
  return { iceServers: servers };
});

async function loadCtx(context: { supabase: any; userId: string }, ticketId: string) {
  const [{ data: roles }, { data: ticket }, { data: open }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("tickets").select("id,user_id,status,subject").eq("id", ticketId).maybeSingle(),
    context.supabase.rpc("is_business_open"),
  ]);
  if (!ticket) throw new Error("Ticket not found");
  return {
    roles: ((roles ?? []) as { role: string }[]).map((r) => String(r.role)),
    ticket: ticket as { id: string; user_id: string; status: string; subject: string },
    businessOpen: open !== false,
  };
}

export const startTicketVideoCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await loadCtx(context, data.ticketId);
    const isOwner = c.ticket.user_id === context.userId;
    if (!c.businessOpen) throw new Error("Video calls are only available during opening hours");
    if (!canStartTicketVideoCall({ roles: c.roles, isOwner, ticketStatus: c.ticket.status, businessOpen: c.businessOpen })) {
      throw new Error("You can't start a video call on this ticket");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Close any stale ringing/live call first (older than 1 hour or still open).
    await supabaseAdmin
      .from("ticket_video_calls")
      .update({ status: "missed", ended_at: new Date().toISOString() })
      .eq("ticket_id", data.ticketId)
      .eq("status", "ringing");
    const { data: row, error } = await supabaseAdmin
      .from("ticket_video_calls")
      .insert({ ticket_id: data.ticketId, started_by: context.userId })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Couldn't start the call");
    try {
      if (isOwner) {
        await supabaseAdmin.from("staff_notifications").insert({
          kind: "live_help",
          title: "Video call — customer waiting",
          body: `A customer is calling from ticket "${c.ticket.subject}". Open the ticket to answer.`,
          link_path: `/tickets?id=${data.ticketId}`,
          entity_id: data.ticketId,
        } as never);
      } else {
        await supabaseAdmin.from("user_notifications").insert({
          user_id: c.ticket.user_id,
          kind: "video_call",
          title: "BM Support is video calling you",
          body: `Open your ticket "${c.ticket.subject}" to answer the call.`,
          link_path: `/tickets?id=${data.ticketId}`,
          source_type: "ticket",
          source_id: data.ticketId,
        } as never);
      }
    } catch (e) {
      console.error("Video call alert failed:", e);
    }
    return { id: String(row.id) };
  });

export const answerTicketVideoCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ callId: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: call } = await supabaseAdmin.from("ticket_video_calls").select("*").eq("id", data.callId).maybeSingle();
    if (!call || call.status !== "ringing") throw new Error("This call has ended");
    const c = await loadCtx(context, String(call.ticket_id));
    const isOwner = c.ticket.user_id === context.userId;
    const startedByOwner = call.started_by === c.ticket.user_id;
    if (!canAnswerTicketVideoCall({ roles: c.roles, isOwner, startedByOwner })) throw new Error("You can't answer this call");
    const now = new Date().toISOString();
    const patch = data.accept
      ? { status: "live", joined_by: context.userId, joined_at: now }
      : { status: "declined", ended_at: now, ended_by: context.userId };
    const { error } = await supabaseAdmin
      .from("ticket_video_calls")
      .update(patch)
      .eq("id", data.callId)
      .eq("status", "ringing");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const endTicketVideoCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ callId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: call } = await supabaseAdmin.from("ticket_video_calls").select("*").eq("id", data.callId).maybeSingle();
    if (!call) return { ok: true as const };
    const c = await loadCtx(context, String(call.ticket_id));
    const isOwner = c.ticket.user_id === context.userId;
    if (!isOwner && !c.roles.some((r) => ["admin", "management", "staff"].includes(r))) throw new Error("Forbidden");
    await supabaseAdmin
      .from("ticket_video_calls")
      .update({ status: call.status === "ringing" ? "missed" : "ended", ended_at: new Date().toISOString(), ended_by: context.userId })
      .eq("id", data.callId)
      .in("status", ["ringing", "live"]);
    return { ok: true as const };
  });
