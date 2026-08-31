import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendAndLogEmail } from "@/lib/email-templates/send-and-log";

async function sendMail(opts: {
  to: string;
  templateName: string;
  templateData: Record<string, any>;
  idempotencyKey: string;
}) {
  await sendAndLogEmail(supabaseAdmin, opts.templateName, opts.to, {
    templateData: opts.templateData,
    idempotencyKey: opts.idempotencyKey,
  });
}

export const requestMfaReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ reason: z.string().trim().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Lookup user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr || !userRes?.user?.email) throw new Error("User not found");
    const userEmail = userRes.user.email;

    // Display name from profiles (best-effort)
    let userName: string | undefined;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();
    userName = (prof as any)?.display_name || (prof as any)?.username || undefined;

    // Admin/management recipients
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "management"] as never);
    const adminIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
    const adminEmails: string[] = [];
    for (const id of adminIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) adminEmails.push(u.user.email);
    }

    const requestedAt = new Date().toISOString();
    const resetUrl = "https://bmsupport.uk/admin-roles";

    const idem = `mfa-reset-${userId}-${Date.now()}`;

    // Send to admins
    let sentAdmins = 0;
    for (const to of adminEmails) {
      try {
        await sendMail({
          to,
          templateName: "twofa-reset-admin",
          templateData: { userEmail, userName, reason: data.reason, resetUrl, requestedAt },
          idempotencyKey: `${idem}-admin-${to}`,
        });
        sentAdmins += 1;
      } catch (e) {
        console.error("2FA reset admin email failed", e);
      }
    }

    // Confirmation to user
    try {
      await sendMail({
        to: userEmail,
        templateName: "twofa-reset-user",
        templateData: { userName },
        idempotencyKey: `${idem}-user`,
      });
    } catch (e) {
      console.error("2FA reset user email failed", e);
    }

    return { ok: true, notifiedAdmins: sentAdmins };
  });