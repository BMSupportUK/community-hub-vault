import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as React from "react";
import { render } from "@react-email/components";
import { template as ticketReplyTpl } from "@/lib/email-templates/ticket-reply";

const SITE_NAME = "BM Support";
const SENDER_DOMAIN = "notify.bmsupport.uk";
const FROM_DOMAIN = "bmsupport.uk";
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

    // Render
    const el = React.createElement(ticketReplyTpl.component, {
      displayName,
      staffName,
      ticketSubject,
      ticketsUrl: TICKETS_URL,
    });
    const html = await render(el);
    const text = await render(el, { plainText: true });
    const subject =
      typeof ticketReplyTpl.subject === "function"
        ? ticketReplyTpl.subject({ ticketSubject })
        : ticketReplyTpl.subject;

    // Unsubscribe token (reuse or create)
    const normalized = ownerEmail.toLowerCase();
    let unsubscribeToken: string;
    const { data: existingTok } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token, used_at")
      .eq("email", normalized)
      .maybeSingle();
    if (existingTok && !(existingTok as any).used_at) {
      unsubscribeToken = (existingTok as any).token as string;
    } else {
      const b = new Uint8Array(32);
      crypto.getRandomValues(b);
      unsubscribeToken = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
      await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .upsert(
          { token: unsubscribeToken, email: normalized } as never,
          { onConflict: "email", ignoreDuplicates: true },
        );
      const { data: stored } = await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", normalized)
        .maybeSingle();
      if (stored) unsubscribeToken = (stored as any).token;
    }

    const messageId = crypto.randomUUID();
    const idempotencyKey = `ticket-reply-${data.messageId}`;

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "ticket-reply",
      recipient_email: ownerEmail,
      status: "pending",
    } as never);

    const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email" as never, {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: ownerEmail,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: "ticket-reply",
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    } as never);
    if (enqErr) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "ticket-reply",
        recipient_email: ownerEmail,
        status: "failed",
        error_message: enqErr.message,
      } as never);
      return { ok: false, reason: "enqueue_failed" };
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
    return { ok: true };
  });
