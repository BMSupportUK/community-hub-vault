import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { template as ticketReplyTpl } from "@/lib/email-templates/ticket-reply";

const TICKETS_URL = "https://bmsupport.uk/tickets";

const STAFF_ROLES = ["admin", "management", "staff", "moderator"] as const;

export const notifyTicketReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ticketId: z.string().uuid(), messageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const callerId = context.userId;

    // Caller must be staff
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isStaff = (callerRoles ?? []).some((r: { role: string }) =>
      (STAFF_ROLES as readonly string[]).includes(r.role),
    );
    if (!isStaff) return { ok: false, reason: "not_staff" };

    // Load message — must exist, belong to ticket, be authored by caller, not internal
    const { data: msg } = await supabaseAdmin
      .from("ticket_messages")
      .select("id, ticket_id, sender_id, is_internal")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!msg || (msg as any).ticket_id !== data.ticketId) return { ok: false, reason: "no_message" };
    if ((msg as any).is_internal) return { ok: false, reason: "internal" };
    if ((msg as any).sender_id !== callerId) return { ok: false, reason: "not_author" };

    // Load ticket — get owner and subject
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("id, user_id, subject")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!ticket) return { ok: false, reason: "no_ticket" };
    const ownerId = (ticket as any).user_id as string;
    if (ownerId === callerId) return { ok: false, reason: "self" };

    // Owner email
    const { data: ownerRes } = await supabaseAdmin.auth.admin.getUserById(ownerId);
    const ownerEmail = ownerRes?.user?.email;
    if (!ownerEmail) return { ok: false, reason: "no_email" };

    // BM Support list check (guest competition addresses never receive support mail)
    const { canEmailList, EMAIL_LIST_SUPPORT } = await import("@/lib/email-lists");
    const allowed = await canEmailList(supabaseAdmin as never, ownerEmail, EMAIL_LIST_SUPPORT);
    if (!allowed) return { ok: false, reason: "suppressed" };

    // Display names
    const [{ data: ownerProf }, { data: staffProf }] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, username").eq("id", ownerId).maybeSingle(),
      supabaseAdmin.from("profiles").select("display_name, username").eq("id", callerId).maybeSingle(),
    ]);
    const displayName =
      (ownerProf as any)?.display_name || (ownerProf as any)?.username || undefined;
    const staffName =
      (staffProf as any)?.display_name || (staffProf as any)?.username || undefined;
    const ticketSubject = (ticket as any).subject as string | undefined;

    const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
    try {
      await sendAndLogEmail(supabaseAdmin, "ticket-reply", ownerEmail, {
        templateData: { displayName, staffName, ticketSubject, ticketsUrl: TICKETS_URL },
        idempotencyKey: `ticket-reply-${data.messageId}`,
      });
    } catch (e) {
      console.error("ticket-reply email failed", e);
      return { ok: false, reason: "send_failed" };
    }

    return { ok: true };
  });
/**
 * Alerts the assigned staff member (in-app notification + chime) when the
 * customer replies on their ticket. Called by the customer's own client after
 * the reply is inserted; uses admin access because a customer cannot write a
 * notification row for another user.
 */
export const notifyStaffOfCustomerReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ticketId: z.string().uuid(), messageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const callerId = context.userId;

    const { data: msg } = await supabaseAdmin
      .from("ticket_messages")
      .select("id, ticket_id, sender_id, is_internal, content")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!msg || (msg as any).ticket_id !== data.ticketId) return { ok: false, reason: "no_message" };
    if ((msg as any).is_internal) return { ok: false, reason: "internal" };
    if ((msg as any).sender_id !== callerId) return { ok: false, reason: "not_author" };

    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("id, user_id, subject, assigned_to")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (!ticket) return { ok: false, reason: "no_ticket" };
    if ((ticket as any).user_id !== callerId) return { ok: false, reason: "not_owner" };

    const assignee = (ticket as any).assigned_to as string | null;
    if (!assignee || assignee === callerId) return { ok: false, reason: "no_assignee" };

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", callerId)
      .maybeSingle();
    const who = (prof as any)?.display_name || (prof as any)?.username || "The customer";
    const subject = ((ticket as any).subject as string | null) ?? "your ticket";
    const preview = String((msg as any).content ?? "").slice(0, 140);

    // Guard against duplicate alerts if the client retries the send.
    const { data: recent } = await supabaseAdmin
      .from("user_notifications")
      .select("id")
      .eq("user_id", assignee)
      .eq("kind", "ticket_reply")
      .eq("source_id", data.ticketId)
      .gte("created_at", new Date(Date.now() - 20000).toISOString())
      .limit(1);
    if ((recent ?? []).length > 0) return { ok: true, deduped: true };

    const { error } = await supabaseAdmin.from("user_notifications").insert({
      user_id: assignee,
      kind: "ticket_reply",
      title: `${who} replied to a ticket`,
      body: preview ? `${subject} — ${preview}` : subject,
      link_path: `/tickets?id=${data.ticketId}&view=assigned`,
      source_type: "ticket",
      source_id: data.ticketId,
    } as never);
    if (error) return { ok: false, reason: error.message };

    // Push the alert so the assignee hears the recorded reply clip even when
    // the app tab is in the background.
    try {
      const { broadcastToUser } = await import("@/lib/push.functions");
      await broadcastToUser(
        assignee,
        `${who} replied to a ticket`,
        preview ? `${subject} — ${preview}` : subject,
        `/tickets?id=${data.ticketId}&view=assigned`,
        `ticket-reply-${data.ticketId}`,
        "ticket-reply",
      );
    } catch (e) {
      console.warn("[ticket-notify] reply push failed", e);
    }
    return { ok: true };
  });
