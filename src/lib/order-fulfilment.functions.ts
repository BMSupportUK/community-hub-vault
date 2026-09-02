import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deriveOrderTerms, extendExpiry, accountTypeLabelFor, type AccountType } from "@/lib/order-terms";

export interface CredentialCandidate {
  id: string;
  account_number: number | null;
  app_login_name: string | null;
  account_type: string | null;
  expiry_at: string | null;
}

export type ApplyOrderResult =
  | {
      status: "applied";
      credentialId: string;
      accountLabel: string;
      months: number;
      newExpiry: string;
      accountType: AccountType | null;
      accountTypeLabel: string;
      unparsed: string[];
    }
  | { status: "needs_selection"; candidates: CredentialCandidate[]; months: number; accountType: AccountType | null }
  | { status: "no_credentials" }
  | { status: "no_term"; unparsed: string[] };

/**
 * Applies a completed order to the customer's app credential: extends the
 * expiry by the purchased months and sets the account type to match the
 * purchase. Admin / management / staff only.
 */
export const applyOrderToCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        credentialId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ApplyOrderResult> => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error(rolesError.message);
    const callerRoles = (roles ?? []).map((r) => String(r.role));
    if (!callerRoles.some((r) => r === "admin" || r === "management" || r === "staff")) {
      throw new Error("Forbidden: staff only");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, existing_username")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Order not found");
    const ownerId = (order as { user_id: string | null }).user_id;
    if (!ownerId) return { status: "no_credentials" };

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("product_name, quantity")
      .eq("order_id", data.orderId);
    if (itemsError) throw new Error(itemsError.message);

    const terms = deriveOrderTerms(
      (items ?? []).map((i) => ({
        product_name: (i as { product_name: string | null }).product_name,
        quantity: (i as { quantity: number | null }).quantity,
      })),
    );
    if (terms.months <= 0) return { status: "no_term", unparsed: terms.unparsed };

    const { data: credsData, error: credsError } = await supabaseAdmin
      .from("app_credentials")
      .select("id, account_number, app_login_name, account_type, expiry_at")
      .eq("owner_id", ownerId)
      .order("account_number", { ascending: true });
    if (credsError) throw new Error(credsError.message);
    const creds = (credsData ?? []) as CredentialCandidate[];
    if (creds.length === 0) return { status: "no_credentials" };

    const existingLogin = ((order as { existing_username: string | null }).existing_username ?? "")
      .trim()
      .toLowerCase();

    let target: CredentialCandidate | undefined;
    if (data.credentialId) {
      target = creds.find((c) => c.id === data.credentialId);
      if (!target) throw new Error("That account does not belong to this customer");
    } else if (existingLogin) {
      target = creds.find((c) => (c.app_login_name ?? "").trim().toLowerCase() === existingLogin);
    }
    if (!target && !data.credentialId && creds.length === 1) target = creds[0];
    if (!target) {
      return {
        status: "needs_selection",
        candidates: creds,
        months: terms.months,
        accountType: terms.accountType,
      };
    }

    const newExpiry = extendExpiry(target.expiry_at, terms.months);
    const patch: Record<string, unknown> = { expiry_at: newExpiry.toISOString() };
    if (terms.accountType) patch['account_type'] = terms.accountType;

    const { error: updateError } = await supabaseAdmin
      .from("app_credentials")
      .update(patch as never)
      .eq("id", target.id);
    if (updateError) throw new Error(updateError.message);

    const effectiveType = (terms.accountType ?? (target.account_type as AccountType | null)) ?? null;
    return {
      status: "applied",
      credentialId: target.id,
      accountLabel: target.app_login_name?.trim() || `Account ${target.account_number ?? "?"}`,
      months: terms.months,
      newExpiry: newExpiry.toISOString(),
      accountType: terms.accountType,
      accountTypeLabel: accountTypeLabelFor(effectiveType),
      unparsed: terms.unparsed,
    };
  });
