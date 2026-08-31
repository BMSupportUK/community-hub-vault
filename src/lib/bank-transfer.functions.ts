import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BankDetails = {
  account_name: string;
  sort_code: string;
  account_number: string;
  iban: string | null;
  bic: string | null;
  reference_prefix: string;
  instructions: string | null;
};

async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: owner only");
}

async function isStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "management", "staff"]);
  return Boolean(data?.length);
}

/** Short, human-friendly bank reference derived from the order id. */
function buildReference(prefix: string, orderId: string) {
  const clean = (prefix || "BM").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "BM";
  const tail = orderId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${clean}-${tail}`;
}

/* ------------------------------- Owner tools ------------------------------ */

export const getBankTransferAdminData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: details } = await supabaseAdmin
      .from("bank_transfer_details")
      .select("account_name,sort_code,account_number,iban,bic,reference_prefix,instructions")
      .eq("singleton", true)
      .maybeSingle();

    const { data: grants } = await supabaseAdmin
      .from("bank_transfer_permissions")
      .select("id,user_id,granted_by,expires_at,revoked_at,note,created_at")
      .order("created_at", { ascending: false });

    const ids = new Set<string>();
    (grants ?? []).forEach((g: any) => {
      if (g.user_id) ids.add(g.user_id);
      if (g.granted_by) ids.add(g.granted_by);
    });
    let profiles: Array<{ id: string; display_name: string | null; app_login_name?: string | null }> = [];
    if (ids.size) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name")
        .in("id", Array.from(ids));
      profiles = (data ?? []) as any;
    }

    return {
      details: (details ?? null) as BankDetails | null,
      grants: (grants ?? []) as Array<{
        id: string;
        user_id: string;
        granted_by: string | null;
        expires_at: string | null;
        revoked_at: string | null;
        note: string | null;
        created_at: string;
      }>,
      names: Object.fromEntries(profiles.map((p) => [p.id, p.display_name ?? "Unknown"])) as Record<string, string>,
    };
  });

export const saveBankTransferDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        account_name: z.string().max(120),
        sort_code: z.string().max(20),
        account_number: z.string().max(40),
        iban: z.string().max(60).nullable().optional(),
        bic: z.string().max(20).nullable().optional(),
        reference_prefix: z.string().max(10),
        instructions: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bank_transfer_details")
      .update({
        account_name: data.account_name,
        sort_code: data.sort_code,
        account_number: data.account_number,
        iban: data.iban ?? null,
        bic: data.bic ?? null,
        reference_prefix: data.reference_prefix || "BM",
        instructions: data.instructions ?? null,
        updated_by: context.userId,
      } as never)
      .eq("singleton", true);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const searchUsersForBankTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string().min(2).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .ilike("display_name", `%${data.query}%`)
      .limit(15);
    return { users: (rows ?? []) as Array<{ id: string; display_name: string | null }> };
  });

export const grantBankTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        expiresAt: z.string().nullable().optional(),
        note: z.string().max(300).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bank_transfer_permissions").upsert(
      {
        user_id: data.userId,
        granted_by: context.userId,
        expires_at: data.expiresAt || null,
        note: data.note ?? null,
        revoked_at: null,
      } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const revokeBankTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bank_transfer_permissions")
      .delete()
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { success: true };
  });

/* ------------------------------ Customer side ----------------------------- */

/** Does the signed-in user currently have bank transfer permission? */
export const getMyBankTransferAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed } = await context.supabase.rpc("can_pay_by_bank_transfer", {
      _user_id: context.userId,
    });
    const { data: grant } = await context.supabase
      .from("bank_transfer_permissions")
      .select("expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { allowed: Boolean(allowed), expiresAt: grant?.expires_at ?? null };
  });

/** Does the OWNER of this order have bank transfer permission? (owner or staff may ask) */
export const getOrderBankTransferAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("id,user_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { allowed: false };
    if (order.user_id !== context.userId && !(await isStaff(context.supabase, context.userId))) {
      return { allowed: false };
    }
    const { data: allowed } = await context.supabase.rpc("can_pay_by_bank_transfer", {
      _user_id: String(order.user_id),
    });
    return { allowed: Boolean(allowed) };
  });

/**
 * Bank details + this order's payment reference. Only returned for a user who
 * currently holds a bank transfer grant and owns the order (or is staff).
 */
export const getBankDetailsForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id,user_id,total_cents,paid_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error(error?.message || "Order not found");

    const staff = await isStaff(context.supabase, context.userId);
    if (!staff && order.user_id !== context.userId) throw new Error("Not authorized");

    const { data: allowed } = await context.supabase.rpc("can_pay_by_bank_transfer", {
      _user_id: String(order.user_id),
    });
    if (!allowed) throw new Error("Bank transfer is not enabled for this order");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: details } = await supabaseAdmin
      .from("bank_transfer_details")
      .select("account_name,sort_code,account_number,iban,bic,reference_prefix,instructions")
      .eq("singleton", true)
      .maybeSingle();

    const { data: existing } = await supabaseAdmin
      .from("order_payments")
      .select("provider,provider_payment_id,status")
      .eq("order_id", data.orderId)
      .maybeSingle();

    const reference =
      existing?.provider === "bank_transfer" && existing.provider_payment_id
        ? String(existing.provider_payment_id)
        : buildReference(details?.reference_prefix ?? "BM", String(data.orderId));

    return {
      details: (details ?? null) as BankDetails | null,
      reference,
      amountCents: Number(order.total_cents ?? 0),
      reported: existing?.provider === "bank_transfer" && existing.status === "awaiting_verification",
      settled: Boolean(order.paid_at),
    };
  });

/** Customer says they've sent the transfer — flags it for staff to verify. */
export const reportBankTransferSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id,user_id,total_cents,paid_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error(error?.message || "Order not found");
    if (order.user_id !== context.userId && !(await isStaff(context.supabase, context.userId))) {
      throw new Error("Not authorized");
    }
    const { data: allowed } = await context.supabase.rpc("can_pay_by_bank_transfer", {
      _user_id: String(order.user_id),
    });
    if (!allowed) throw new Error("Bank transfer is not enabled for this order");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: details } = await supabaseAdmin
      .from("bank_transfer_details")
      .select("reference_prefix")
      .eq("singleton", true)
      .maybeSingle();

    const { data: existing } = await supabaseAdmin
      .from("order_payments")
      .select("id,provider,provider_payment_id,status")
      .eq("order_id", data.orderId)
      .maybeSingle();

    const reference =
      existing?.provider === "bank_transfer" && existing.provider_payment_id
        ? String(existing.provider_payment_id)
        : buildReference(details?.reference_prefix ?? "BM", String(data.orderId));

    const amountCents = Number(order.total_cents ?? 0);

    if (existing?.id) {
      await supabaseAdmin
        .from("order_payments")
        .update({
          provider: "bank_transfer",
          provider_payment_id: reference,
          status: "awaiting_verification",
          amount_cents: amountCents,
        } as never)
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("order_payments").insert({
        order_id: data.orderId,
        provider: "bank_transfer",
        provider_payment_id: reference,
        status: "awaiting_verification",
        amount_cents: amountCents,
        currency: "GBP",
        created_by: context.userId,
      } as never);
    }

    const { postBankTransferReportedNotice } = await import("@/lib/bank-transfer-notice.server");
    const notice = await postBankTransferReportedNotice({
      orderId: String(data.orderId),
      reference,
      amountCents,
      actorId: context.userId,
    });

    return { success: true, reference, ticketId: notice.ticketId ?? null };
  });

/** Staff/owner confirm the money landed — settles the order as paid. */
export const confirmBankTransferReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "management"]);
    if (!roles?.length) throw new Error("Forbidden: admin or management only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("order_payments")
      .select("id,provider_payment_id")
      .eq("order_id", data.orderId)
      .maybeSingle();

    const reference = payment?.provider_payment_id ? String(payment.provider_payment_id) : String(data.orderId);

    if (payment?.id) {
      await supabaseAdmin
        .from("order_payments")
        .update({ provider: "bank_transfer", status: "paid" } as never)
        .eq("id", payment.id);
    }

    const { error: rpcErr } = await supabaseAdmin.rpc("mark_order_paid" as never, {
      p_order_id: String(data.orderId),
      p_transaction_id: reference,
    } as never);
    if (rpcErr) {
      const { error: fallbackErr } = await supabaseAdmin
        .from("orders")
        .update({ paid_at: new Date().toISOString(), paid_by: context.userId, status: "paid" } as never)
        .eq("id", data.orderId);
      if (fallbackErr) throw new Error(fallbackErr.message);
    }

    try {
      const { postOrderPaymentReceivedNotice } = await import("@/lib/order-payment-notice.server");
      await postOrderPaymentReceivedNotice({
        orderId: String(data.orderId),
        provider: "Bank Transfer",
        reference,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("Failed to post bank transfer payment notice:", e);
    }

    return { success: true };
  });
