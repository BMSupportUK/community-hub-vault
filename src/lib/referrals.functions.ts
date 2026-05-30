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
        referrerUsername: z.string().min(1).max(64),
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

    if (data.userId === userId) {
      // Theoretically harmless but avoid self-assignment confusion
      throw new Error("You can't assign a referrer to yourself.");
    }

    // Look up referrer profile
    const { data: ref, error: refErr } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .ilike("username", data.referrerUsername)
      .maybeSingle();
    if (refErr) throw new Error(refErr.message);
    if (!ref) throw new Error(`No user found with username "${data.referrerUsername}".`);
    if (ref.id === data.userId) throw new Error("A user cannot refer themselves.");

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

    // Generate a unique invite code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const makeCode = () => {
      let c = "";
      for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
      return c;
    };
    const nowIso = new Date().toISOString();
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = makeCode();
      const { error } = await supabaseAdmin.from("invites").insert({
        code,
        created_by: ref.id,
        used_by: data.userId,
        used_at: nowIso,
      });
      if (!error) {
        return {
          success: true,
          code,
          referrer: { id: ref.id, username: ref.username },
        };
      }
      lastError = error.message;
      if (!error.message.toLowerCase().includes("unique")) break;
    }
    throw new Error(lastError ?? "Could not create invite.");
  });