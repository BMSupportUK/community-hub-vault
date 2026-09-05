import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE_URL = "https://bmsupport.uk";

/**
 * Sends the "account approved" email for whichever product the user was
 * approved for. Staff-only: the caller must hold a moderator/admin role.
 */
export const sendAccountApprovalEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        product: z.enum(["bm-support", "fan-zone"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    const allowed = ["admin", "management", "moderator", "boro_fan_zone_moderator"];
    if (!callerRoles.some((r) => allowed.includes(r))) {
      throw new Error("Forbidden: staff only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const toEmail = targetUser?.user?.email;
    if (!toEmail) return { sent: false, reason: "no_email" as const };

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", data.userId)
      .maybeSingle();
    const displayName =
      (prof as any)?.display_name || (prof as any)?.username || undefined;

    const isFanZone = data.product === "fan-zone";
    const templateName = isFanZone ? "fan-zone-approved" : "account-approved";
    const templateData = isFanZone
      ? { displayName, fanZoneUrl: `${BASE_URL}/fan-zone` }
      : { displayName, loginUrl: `${BASE_URL}/home` };

    const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
    const result = await sendAndLogEmail(supabaseAdmin, templateName, toEmail, {
      templateData,
      idempotencyKey: `${templateName}-${data.userId}`,
    });
    return result;
  });
