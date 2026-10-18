import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Which customers already have a discount code against their account.
 *
 * The admin Customers list prints a green tick beside these usernames so the
 * team can see who has a code without opening the Discount Codes page.
 * Discount code rows are only readable through RLS by admin (and only their
 * own codes by everyone else), so the answer is computed server-side for
 * whoever may see the customer list — admin, management or staff — and returns
 * account ids only, never the code values.
 */

export type DiscountCodeFlagRow = { user_id?: string | null; is_active?: boolean | null };

/**
 * Account ids that currently have a usable discount code.
 *
 * A code must be active and belong to one customer: codes that were revoked
 * never tick, and a "for everyone" code (no customer) ticks nobody.
 */
export function discountFlagUserIds(rows: DiscountCodeFlagRow[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    if (row.is_active === false) continue;
    if (row.user_id == null) continue;
    ids.add(String(row.user_id));
  }
  return [...ids];
}

export const getCustomerDiscountFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management" || r === "staff")) {
      throw new Error("Forbidden: admin, management or staff only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("discount_codes")
      .select("user_id,is_active");
    if (error) throw new Error(error.message);

    return { userIds: discountFlagUserIds((data ?? []) as DiscountCodeFlagRow[]) };
  });
