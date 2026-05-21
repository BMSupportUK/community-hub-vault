import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.userId === userId) {
      throw new Error("You can't delete your own account.");
    }

    // Verify caller is admin or management via RLS-aware client
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management")) {
      throw new Error("Forbidden: admin or management only");
    }

    // Block deleting another admin unless caller is admin
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const targetIsAdmin = (targetRoles ?? []).some((r) => String(r.role) === "admin");
    if (targetIsAdmin && !callerRoles.includes("admin")) {
      throw new Error("Only an admin can delete another admin.");
    }

    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (delError) throw new Error(delError.message);

    return { success: true };
  });

export const listMemberEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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

    const emails: Record<string, string> = {};
    let page = 1;
    // paginate through auth users
    // perPage max 1000
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        if (u.email) emails[u.id] = u.email;
      }
      if (data.users.length < 1000) break;
      page += 1;
      if (page > 20) break; // safety
    }
    return { emails };
  });