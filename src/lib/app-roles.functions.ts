import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createAppRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ name: z.string().trim().min(1).max(40), label: z.string().trim().max(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["admin", "management"],
    });
    if (!allowed) return { error: "Not authorized" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("create_app_role", { _name: data.name, _label: data.label || data.name });
    if (error) return { error: error.message === "Invalid role name" ? "Invalid role name" : "Could not create role" };
    return { ok: true };
  });
