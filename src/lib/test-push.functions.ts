import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin/management only: sends a REAL test push of the chosen alert kind to
 * the caller's own registered devices, using the exact same data.kind values
 * production alerts use — so Android routes each one to its dedicated sound
 * channel and the phone plays the real tone.
 */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind?: string }) => input)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "management"]);
    if (!roles?.length) throw new Error("Admins only");

    // Each entry mirrors a real production alert's data payload.
    const KINDS: Record<string, { title: string; body: string; data: Record<string, string> }> = {
      ticket: {
        title: "Test: New ticket",
        body: "This is how a new-ticket alert sounds.",
        data: { kind: "ticket", url: "/admin-tickets" },
      },
      ticket_reply: {
        title: "Test: Ticket reply",
        body: "This is how a ticket-reply alert sounds.",
        data: { kind: "ticket_reply", url: "/tickets" },
      },
      mention: {
        title: "Test: Mention",
        body: "This is how a mention alert sounds.",
        data: { kind: "mention", url: "/home" },
      },
      shift_start: {
        title: "Test: Shift start",
        body: "This is how a shift-start alert sounds.",
        data: { kind: "shift_start", url: "/time-tracking" },
      },
      shift_end: {
        title: "Test: Shift end",
        body: "This is how a shift-end alert sounds.",
        data: { kind: "shift_end", url: "/time-tracking" },
      },
      outage: {
        title: "Test: Outage raised",
        body: "This is how an outage alert sounds.",
        data: { kind: "incident", event: "created", url: "/status" },
      },
      outage_resolved: {
        title: "Test: Outage resolved",
        body: "This is how an outage-resolved alert sounds.",
        data: { kind: "incident", event: "resolved", url: "/status" },
      },
      order: {
        title: "Test: New order",
        body: "This is how a new-order alert sounds.",
        data: { kind: "order", url: "/admin-orders" },
      },
      payment: {
        title: "Test: Payment confirmed",
        body: "This is how a payment alert sounds.",
        data: { kind: "order_paid", url: "/admin-orders" },
      },
    };

    const kind = data?.kind;
    if (kind !== "all" && (!kind || !KINDS[kind])) throw new Error("Unknown kind");

    const { pushToUser } = await import("@/lib/fcm.server");

    const send = async (key: string) => {
      const k = KINDS[key];
      return pushToUser(userId, { title: k.title, body: k.body, data: k.data });
    };

    if (kind === "all") {
      const results: Record<string, { sent: number; failed: number; skipped?: string }> = {};
      for (const key of Object.keys(KINDS)) {
        results[key] = await send(key);
        // Small gap so the phone plays each tone separately.
        await new Promise((r) => setTimeout(r, 1500));
      }
      return results;
    }

    return { [kind!]: await send(kind!) };
  });
