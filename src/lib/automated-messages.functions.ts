import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Message wording for signed-in users. The table itself is staff-only, so
 * members get just the key/body pairs they need to post automated messages.
 */
const CUSTOMER_MESSAGE_KEYS = [
  "order_cancelled", "order_invoice_cancelled", "ticket_bank_holiday", "ticket_out_of_hours",
  "order_setting_up_account", "order_subscription_updating",
];

export const getAutomatedMessageBodies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isStaff = (roles ?? []).some((r: { role: string }) => ["admin", "management", "staff", "moderator"].includes(r.role));
    let q = supabaseAdmin.from("automated_messages").select("key, body");
    // Members only get the customer-facing wording their own pages post.
    if (!isStaff) q = q.in("key", CUSTOMER_MESSAGE_KEYS);
    const { data, error } = await q;
    if (error) throw new Error("Could not load messages");
    return (data ?? []) as { key: string; body: string }[];
  });
