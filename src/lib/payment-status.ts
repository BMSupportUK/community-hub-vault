const SETTLED_PAYMENT_STATUSES = new Set([
  "approved",
  "captured",
  "completed",
  "finished",
  "paid",
]);

export function isSettledPaymentStatus(status: unknown): boolean {
  return SETTLED_PAYMENT_STATUSES.has(String(status ?? "").toLowerCase());
}