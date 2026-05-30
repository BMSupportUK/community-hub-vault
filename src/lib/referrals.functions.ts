import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Admin-only: assign a referrer to a user who signed up without an invite code.
 * Creates an `invites` row with the referrer as `created_by` and the target user
 * as `used_by`/`used_at`. Bypasses RLS via the admin client.
 */
export const assignReferrer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        code: z.string().min(1).max(32),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin or management
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    // Ensure target user exists
    const { data: target, error: tgtErr } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("id", data.userId)
      .maybeSingle();
    if (tgtErr) throw new Error(tgtErr.message);
    if (!target) throw new Error("Target user not found.");

    // Block if user already has a referrer
    const { data: existing } = await supabaseAdmin
      .from("invites")
      .select("id, created_by")
      .eq("used_by", data.userId)
      .maybeSingle();
    if (existing) throw new Error("This user already has a referrer assigned.");

    // Look up the invite by code
    const normalizedCode = data.code.trim().toUpperCase();
    const { data: invite, error: invErr } = await supabaseAdmin
      .from("invites")
      .select("id, code, created_by, used_by")
      .ilike("code", normalizedCode)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite) throw new Error(`No invite found with code "${normalizedCode}".`);
    if (invite.used_by) throw new Error("That invite code has already been used.");
    if (invite.created_by === data.userId) {
      throw new Error("A user cannot redeem their own invite code.");
    }

    // Resolve referrer profile for the response
    const { data: ref } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("id", invite.created_by)
      .maybeSingle();

    // Mark the invite used by the target user
    const { error: updErr } = await supabaseAdmin
      .from("invites")
      .update({ used_by: data.userId, used_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (updErr) throw new Error(updErr.message);

    return {
      success: true,
      code: invite.code,
      referrer: { id: invite.created_by, username: ref?.username ?? null },
    };
  });