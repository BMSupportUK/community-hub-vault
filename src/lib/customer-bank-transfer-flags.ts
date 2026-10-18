import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Which customers are set up to pay by bank transfer.
 *
 * The admin Customers list prints a £ sign beside these usernames so the team
 * can see who may pay by bank transfer without opening the Bank transfer
 * screen. Permission rows are only readable through RLS by admin (and only
 * their own by the customer), so the answer is computed server-side for
 * whoever may see the customer list — admin, management or staff.
 */

export type BankTransferGrantRow = {
  user_id?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
};

/**
 * Account ids that may pay by bank transfer right now.
 *
 * A permission counts when it was never revoked and either has no expiry date
 * or has not run out yet.
 */
export function bankTransferUserIds(
  rows: BankTransferGrantRow[] | null | undefined,
  now: number = Date.now(),
): string[] {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    if (row.user_id == null) continue;
    if (row.revoked_at) continue;
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
    ids.add(String(row.user_id));
  }
  return [...ids];
}

export const getCustomerBankTransferFlags = createServerFn({ method: "POST" })
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
      .from("bank_transfer_permissions")
      .select("user_id,expires_at,revoked_at");
    if (error) throw new Error(error.message);

    return { userIds: bankTransferUserIds((data ?? []) as BankTransferGrantRow[]) };
  });
