import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "management"]);
  if (!data || data.length === 0) throw new Error("Not authorized");
}

// in-memory FX cache (5 min)
let rateCache: { value: number; at: number } | null = null;

async function fetchGbpToUsdtRate(): Promise<number> {
  if (rateCache && Date.now() - rateCache.at < 5 * 60_000) return rateCache.value;
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=gbp",
  );
  if (!res.ok) throw new Error("Failed to fetch GBP→USDT rate");
  const j = await res.json();
  const gbpPerUsdt = Number(j?.tether?.gbp);
  if (!gbpPerUsdt || gbpPerUsdt <= 0) throw new Error("Invalid FX response");
  rateCache = { value: gbpPerUsdt, at: Date.now() };
  return gbpPerUsdt;
}

export const getGbpToUsdtRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const rate = await fetchGbpToUsdtRate();
    return { gbpPerUsdt: rate, fetchedAt: new Date().toISOString() };
  });

export const getPayoutSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("crypto_payout_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const SettingsInput = z.object({
  asset: z.string().min(1).max(16),
  network: z.string().min(1).max(32),
  wallet_address: z.string().trim().min(0).max(255),
  markup_pct: z.number().min(0).max(50),
  min_payout_usdt: z.number().min(0).max(1_000_000),
});

export const updatePayoutSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crypto_payout_settings")
      .update({ ...data, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function computeUsdt(gbpCents: number, gbpPerUsdt: number, markupPct: number) {
  const gbp = gbpCents / 100;
  const gross = gbp / gbpPerUsdt;
  const net = gross * (1 - markupPct / 100);
  return Math.round(net * 100) / 100;
}

/** Lock FX rate + USDT amount on first read for any pending row missing it. */
export const lockPendingPayoutRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("crypto_payouts")
      .select("id, gbp_amount_cents, markup_pct, gbp_to_usdt_rate, usdt_amount")
      .eq("status", "pending")
      .is("usdt_amount", null);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { locked: 0 };
    const rate = await fetchGbpToUsdtRate();
    let n = 0;
    for (const r of rows) {
      const usdt = computeUsdt(r.gbp_amount_cents, rate, Number(r.markup_pct ?? 0));
      const { error: upErr } = await context.supabase
        .from("crypto_payouts")
        .update({ gbp_to_usdt_rate: rate, usdt_amount: usdt })
        .eq("id", r.id);
      if (!upErr) n++;
    }
    return { locked: n, rate };
  });

export const listPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "sent" | "skipped"; limit?: number }) => ({
    status: input?.status,
    limit: Math.min(input?.limit ?? 100, 500),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("crypto_payouts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const MarkSentInput = z.object({
  id: z.string().uuid(),
  tx_hash: z.string().trim().min(4).max(255),
  notes: z.string().trim().max(1000).optional(),
});

export const markPayoutSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MarkSentInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crypto_payouts")
      .update({
        status: "sent",
        tx_hash: data.tx_hash,
        notes: data.notes ?? null,
        sent_at: new Date().toISOString(),
        sent_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const skipPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), notes: z.string().max(1000).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crypto_payouts")
      .update({ status: "skipped", notes: data.notes ?? null, sent_at: new Date().toISOString(), sent_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });