import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bans a member from the Boro Fan Zone (separate from BM Support account bans)
 * and emails them the Fan Zone ban notice with the email-only appeal route.
 *
 * The ban itself runs through the fan_zone_ban RPC as the calling user, so the
 * database still enforces who is allowed to ban.
 */
export const banFanZoneMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        minutes: z.number().int().positive().nullable(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("fan_zone_ban" as never, {
      _user_id: data.userId,
      _minutes: data.minutes,
      _reason: data.reason,
    } as never);
    if (error) throw new Error(error.message);

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      const toEmail = authUser?.user?.email;
      if (toEmail) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("display_name, username")
          .eq("id", data.userId)
          .maybeSingle();
        const displayName = (prof as any)?.display_name || (prof as any)?.username || undefined;
        const expiresAt = data.minutes ? new Date(Date.now() + data.minutes * 60_000).toISOString() : null;
        const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
        const { FAN_ZONE_APPEAL_EMAIL } = await import("@/lib/email-templates/fan-zone-banned");
        await sendAndLogEmail(supabaseAdmin, "fan-zone-banned", toEmail, {
          templateData: { displayName, reason: data.reason, expiresAt },
          replyTo: FAN_ZONE_APPEAL_EMAIL,
          idempotencyKey: `fan-zone-banned-${data.userId}-${Date.now()}`,
        });
      }
    } catch (err) {
      console.error("fan zone ban email failed", err);
    }

    return { ok: true };
  });
