import { isSettledPaymentStatus } from './payment-status';

export type ProfitItem = { product_id: string | null; product_name: string; unit_price_cents: number; quantity: number; unit_cost_cents: number | null };
export type ProfitPayment = { provider: string | null; status: string | null; currency: string | null; provider_fee_cents: number | null };
export type ProfitOrder = { total_cents: number; order_items: ProfitItem[]; payments: ProfitPayment[] };

export function calculateProfit(order: ProfitOrder) {
  let cost = 0;
  let missing = false;
  for (const item of order.order_items) {
    if (item.unit_cost_cents == null) missing = true;
    else cost += item.unit_cost_cents * item.quantity;
  }
  const payments = order.payments.filter(p => isSettledPaymentStatus(p.status));
  let fees = 0;
  let feesMissing = payments.length === 0;
  for (const payment of payments) {
    if (payment.provider === 'cash' && payment.provider_fee_cents == null) continue;
    if (payment.currency?.toUpperCase() !== 'GBP' || !Number.isSafeInteger(payment.provider_fee_cents) || payment.provider_fee_cents == null || payment.provider_fee_cents < 0) feesMissing = true;
    else fees += payment.provider_fee_cents;
  }
  return { revenue: order.total_cents, cost, fees, feesMissing, missing: missing || feesMissing, profit: order.total_cents - cost - fees };
}

// Allocate order revenue (including discounts) and fees once, in integer pence.
export function allocateOrderAmounts(order: ProfitOrder) {
  const weights = order.order_items.map(i => Math.max(0, i.unit_price_cents * i.quantity));
  const total = weights.reduce((a, b) => a + b, 0);
  const allocate = (amount: number) => {
    let used = 0;
    return weights.map((weight, index) => {
      const value = index === weights.length - 1 ? amount - used : Math.floor(amount * (total ? weight / total : 1 / weights.length));
      used += value;
      return value;
    });
  };
  const result = calculateProfit(order);
  return { revenue: allocate(result.revenue), fees: allocate(result.fees), feesMissing: result.feesMissing };
}

export function squareProcessingFee(payment: { processing_fee?: { amount_money?: { amount?: number; currency?: string } }[] }): number | null {
  if (!payment.processing_fee?.length) return null;
  let total = 0;
  for (const fee of payment.processing_fee) {
    const money = fee.amount_money;
    if (money?.currency !== 'GBP' || !Number.isSafeInteger(money.amount) || money.amount == null || money.amount < 0) return null;
    total += money.amount;
  }
  return total;
}