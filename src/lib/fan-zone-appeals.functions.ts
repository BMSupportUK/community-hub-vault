import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "management", "moderator", "boro_fan_zone_moderator"] as const;

/**
 * A banned member sends (or follows up on) their Fan Zone ban appeal.
 * Runs as the calling user, so RLS still decides what they can write.
 */
export const submitFanZoneAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ body: z.string().trim().min(10).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing, error: findErr } = await supabase
      .from("fan_zone_appeals")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    let appealId = existing?.id ?? null;
    if (!appealId) {
      const { data: created, error: insErr } = await supabase
        .from("fan_zone_appeals")
        .insert({ user_id: userId })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      appealId = created.id;
    }

    const { error: msgErr } = await supabase
      .from("fan_zone_appeal_messages")
      .insert({ appeal_id: appealId, author_id: userId, from_staff: false, body: data.body });
    if (msgErr) throw new Error(msgErr.message);

    return { ok: true, appealId };
  });

/**
 * A moderator replies to an appeal. The reply is kept on the thread and emailed
 * to the member so they see it even while they are locked out.
 */
export const replyToFanZoneAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        appealId: z.string().uuid(),
        body: z.string().trim().min(2).max(2000),
        close: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isStaff, error: roleErr } = await supabase.rpc("has_any_role", {
      _user_id: userId,
      _roles: [...STAFF_ROLES],
    } as never);
    if (roleErr) throw new Error(roleErr.message);
    if (!isStaff) throw new Error("Forbidden");

    const { data: appeal, error: appealErr } = await supabase
      .from("fan_zone_appeals")
      .select("id, user_id")
      .eq("id", data.appealId)
      .single();
    if (appealErr) throw new Error(appealErr.message);

    const { error: msgErr } = await supabase
      .from("fan_zone_appeal_messages")
      .insert({ appeal_id: data.appealId, author_id: userId, from_staff: true, body: data.body });
    if (msgErr) throw new Error(msgErr.message);

    if (data.close) {
      await supabase.from("fan_zone_appeals").update({ status: "closed" }).eq("id", data.appealId);
    }

    // Email the member their reply. Never block the reply itself on email.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(appeal.user_id);
      const toEmail = authUser?.user?.email;
      if (toEmail) {
        const [{ data: prof }, { data: actor }, { data: firstMsg }] = await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select("display_name, username")
            .eq("id", appeal.user_id)
            .maybeSingle(),
          supabaseAdmin.from("profiles").select("display_name, username").eq("id", userId).maybeSingle(),
          supabaseAdmin
            .from("fan_zone_appeal_messages")
            .select("body")
            .eq("appeal_id", data.appealId)
            .eq("from_staff", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const displayName =
          (prof as any)?.display_name || (prof as any)?.username || undefined;
        const moderator = (actor as any)?.display_name || (actor as any)?.username || undefined;
        const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
        const { FAN_ZONE_APPEAL_EMAIL } = await import("@/lib/email-templates/fan-zone-banned");
        await sendAndLogEmail(supabaseAdmin, "fan-zone-appeal-reply", toEmail, {
          templateData: {
            displayName,
            reply: data.body,
            appealText: (firstMsg as any)?.body ?? undefined,
            moderator,
          },
          replyTo: FAN_ZONE_APPEAL_EMAIL,
          idempotencyKey: `fan-zone-appeal-reply-${data.appealId}-${Date.now()}`,
        });
      }
    } catch (err) {
      console.error("fan zone appeal reply email failed", err);
    }

    return { ok: true };
  });

/** Reopen or close an appeal from the moderation centre. */
export const setFanZoneAppealStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ appealId: z.string().uuid(), status: z.enum(["open", "replied", "closed"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("fan_zone_appeals")
      .update({ status: data.status })
      .eq("id", data.appealId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
