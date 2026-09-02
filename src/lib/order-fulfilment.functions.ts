import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deriveOrderTerms, accountTypeLabelFor, type AccountType } from "@/lib/order-terms";

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
      created: boolean;
      unparsed: string[];
    }
  /** Customer has several accounts and the order didn't say which to renew. */
  | { status: "needs_selection"; candidates: CredentialCandidate[]; months: number; accountType: AccountType | null }
  /** New or additional account: staff must enter a login name and password. */
  | {
      status: "needs_new_credentials";
      months: number;
      accountType: AccountType | null;
      existingAccounts: CredentialCandidate[];
    }
  | { status: "no_term"; unparsed: string[] };

/** Roles allowed to fulfil an order. */
async function assertStaff(supabase: any, userId: string) {
  const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const callerRoles = (roles ?? []).map((r: { role: string }) => String(r.role));
  if (!callerRoles.some((r: string) => r === "admin" || r === "management" || r === "staff")) {
    throw new Error("Forbidden: staff only");
  }
}

interface OrderRow {
  user_id: string | null;
  existing_username: string | null;
  customer_type: string | null;
}

async function loadOrderContext(orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, existing_username, customer_type")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("Order not found");

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select("product_name, quantity")
    .eq("order_id", orderId);
  if (itemsError) throw new Error(itemsError.message);

  const terms = deriveOrderTerms(
    (items ?? []).map((i) => ({
      product_name: (i as { product_name: string | null }).product_name,
      quantity: (i as { quantity: number | null }).quantity,
    })),
  );

  const ownerId = (order as unknown as OrderRow).user_id;
  let creds: CredentialCandidate[] = [];
  if (ownerId) {
    const { data: credsData, error: credsError } = await supabaseAdmin
      .from("app_credentials")
      .select("id, account_number, app_login_name, account_type, expiry_at")
      .eq("owner_id", ownerId)
      .order("account_number", { ascending: true });
    if (credsError) throw new Error(credsError.message);
    creds = (credsData ?? []) as CredentialCandidate[];
  }

  return { order: order as unknown as OrderRow, terms, creds, ownerId };
}

/**
 * Works out what a completed order means for the customer's credentials:
 * renews an existing account by the months purchased, or asks staff for the
 * login name and password when it's a new / additional account.
 * Admin / management / staff only.
 */
export const applyOrderToCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orderId: z.string().uuid(), credentialId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ApplyOrderResult> => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { order, terms, creds } = await loadOrderContext(data.orderId);
    if (terms.months <= 0) return { status: "no_term", unparsed: terms.unparsed };

    const existingLogin = (order.existing_username ?? "").trim().toLowerCase();
    const isNewAccountSale = (order.customer_type ?? "").trim().toLowerCase() === "new";

    let target: CredentialCandidate | undefined;
    if (data.credentialId) {
      target = creds.find((c) => c.id === data.credentialId);
      if (!target) throw new Error("That account does not belong to this customer");
    } else if (existingLogin) {
      target = creds.find((c) => (c.app_login_name ?? "").trim().toLowerCase() === existingLogin);
    } else if (!isNewAccountSale && creds.length === 1) {
      target = creds[0];
    }

    if (!target) {
      // New sale, or no accounts at all → staff sets up the account details.
      if (isNewAccountSale || creds.length === 0) {
        return {
          status: "needs_new_credentials",
          months: terms.months,
          accountType: terms.accountType,
          existingAccounts: creds,
        };
      }
      return {
        status: "needs_selection",
        candidates: creds,
        months: terms.months,
        accountType: terms.accountType,
      };
    }

    const { data: newExpiry, error } = await supabase.rpc("staff_extend_credential", {
      p_credential_id: target.id,
      p_months: terms.months,
      p_account_type: terms.accountType,
    });
    if (error) throw new Error(error.message);

    const effectiveType = terms.accountType ?? ((target.account_type as AccountType | null) ?? null);
    return {
      status: "applied",
      credentialId: target.id,
      accountLabel: target.app_login_name?.trim() || `Account ${target.account_number ?? "?"}`,
      months: terms.months,
      newExpiry: new Date(newExpiry as unknown as string).toISOString(),
      accountType: terms.accountType,
      accountTypeLabel: accountTypeLabelFor(effectiveType),
      created: false,
      unparsed: terms.unparsed,
    };
  });

/**
 * Creates the new / additional account for a completed order using the login
 * name and password staff entered, with the expiry set from the months
 * purchased. Admin / management / staff only.
 */
export const createCredentialForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        loginName: z.string().trim().min(1).max(120),
        password: z.string().min(1).max(200),
        accountType: z.enum(["single", "multi", "triple"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ApplyOrderResult> => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { terms, ownerId } = await loadOrderContext(data.orderId);
    if (terms.months <= 0) return { status: "no_term", unparsed: terms.unparsed };
    if (!ownerId) throw new Error("This order has no customer attached");

    const accountType = data.accountType ?? terms.accountType ?? "single";
    const { data: rows, error } = await supabase.rpc("staff_create_credential", {
      p_owner_id: ownerId,
      p_login_name: data.loginName,
      p_password: data.password,
      p_months: terms.months,
      p_account_type: accountType,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rows) ? rows[0] : rows) as
      | { credential_id: string; account_number: number; expiry_at: string }
      | undefined;
    if (!row) throw new Error("Account could not be created");

    return {
      status: "applied",
      credentialId: row.credential_id,
      accountLabel: data.loginName.trim(),
      months: terms.months,
      newExpiry: new Date(row.expiry_at).toISOString(),
      accountType: accountType as AccountType,
      accountTypeLabel: accountTypeLabelFor(accountType as AccountType),
      created: true,
      unparsed: terms.unparsed,
    };
  });
