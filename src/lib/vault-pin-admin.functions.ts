import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const resetUserVaultPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Reset PIN to "0000" (sha256 of `${user_id}:0000`) so the user can unlock
    // and is prompted to change it. Matches client-side hashing scheme.
    const enc = new TextEncoder().encode(`${data.userId}:0000`);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    const pinHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error } = await supabaseAdmin
      .from("vault_pins")
      .upsert({ user_id: data.userId, pin_hash: pinHash, must_change: true });
    if (error) throw new Error(error.message);

    return { success: true, tempPin: "0000" };
  });
