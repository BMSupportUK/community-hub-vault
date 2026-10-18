import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Emails of customers an owner added by hand (rows in manually_added_customers).
 *
 * Owner tools (bank transfer customers, discount code allocation) show these
 * next to the username so the team can tell which customer an account belongs
 * to before that customer signs in and picks their own username. Emails stay
 * admin/management only — they are never returned to any other role.
 */
export const getManualCustomerEmails = createServerFn({ method: "POST" })
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

    // RLS on manually_added_customers already limits reads to admin/management.
    const { data: rows, error } = await supabase
      .from("manually_added_customers")
      .select("user_id");
    if (error) throw new Error(error.message);

    const manualIds = new Set((rows ?? []).map((r: any) => String(r.user_id)));
    const emails: Record<string, string> = {};
    if (!manualIds.size) return { emails };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let page = 1;
    while (true) {
      const { data, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) throw new Error(listErr.message);
      for (const u of data.users) {
        if (u.email && manualIds.has(u.id)) emails[u.id] = u.email;
      }
      if (data.users.length < 1000) break;
      page += 1;
      if (page > 20) break; // safety
    }

    return { emails };
  });
