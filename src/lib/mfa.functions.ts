import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const resetUserMfa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string().uuid(),
      reason: z.string().trim().max(500).optional(),
    }).parse(input),
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

    // List the target's MFA factors and delete every one
    const { data: factorsData, error: listError } =
      await supabaseAdmin.auth.admin.mfa.listFactors({ userId: data.userId });
    if (listError) throw new Error(listError.message);

    const factors = factorsData?.factors ?? [];
    let removed = 0;
    for (const f of factors) {
      const { error: delErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        userId: data.userId,
        id: f.id,
      });
      if (delErr) throw new Error(delErr.message);
      removed += 1;
    }

    // Audit
    await supabaseAdmin.from("mfa_reset_log").insert({
      target_user_id: data.userId,
      reset_by: userId,
      reason: data.reason ?? null,
    });

    return { success: true, removed };
  });

export const listMyMfaFactors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
    if (error) throw new Error(error.message);
    return {
      factors: (data?.factors ?? []).map((f) => ({
        id: f.id,
        factor_type: f.factor_type,
        status: f.status,
        friendly_name: f.friendly_name ?? null,
        created_at: f.created_at,
      })),
    };
  });

export const listUserMfaFactors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden");
    }
    const { data: f, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: data.userId });
    if (error) throw new Error(error.message);
    return { count: (f?.factors ?? []).filter((x) => x.status === "verified").length };
  });
