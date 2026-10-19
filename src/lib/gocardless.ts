/** Browser-safe GoCardless helpers (shared by server code and tests). */
export type PayByBankProvider = "stripe" | "gocardless";
export type GoCardlessEnv = "live" | "sandbox";

export const PAY_BY_BANK_PROVIDER_KEY = "pay_by_bank_provider";

/** GoCardless is only used when chosen AND its token is saved; otherwise Stripe. */
export function resolvePayByBankProvider(saved: unknown, goCardlessReady: boolean): PayByBankProvider {
  const v = saved && typeof saved === "object" && "provider" in saved ? (saved as { provider: unknown }).provider : saved;
  return v === "gocardless" && goCardlessReady ? "gocardless" : "stripe";
}

/** Live token wins; the sandbox token is only used when no live token exists. */
export function pickGoCardlessEnv(hasLive: boolean, hasSandbox: boolean): GoCardlessEnv | null {
  if (hasLive) return "live";
  if (hasSandbox) return "sandbox";
  return null;
}

const SETTLED = new Set(["confirmed", "paid_out"]);
export function isGoCardlessPaid(status: string | null | undefined) {
  return SETTLED.has(String(status ?? "").toLowerCase());
}

/** Sum of GoCardless fees (pence, positive) for one payment from payout items. */
export function goCardlessFeeFromPayoutItems(items: { type?: string; amount?: string | number; links?: { payment?: string } }[], paymentId: string) {
  let fee = 0;
  for (const it of items) {
    if (it.links?.payment !== paymentId) continue;
    if (it.type === "gocardless_fee" || it.type === "app_fee") fee += Math.abs(Math.round(Number(it.amount) * 100));
  }
  return fee;
}
