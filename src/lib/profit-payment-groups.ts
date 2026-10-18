import { isSettledPaymentStatus } from './payment-status';

export const PROFIT_METHOD_LABELS: Record<string, string> = { square: 'Square', stripe: 'Stripe', paypal: 'PayPal', open_banking: 'Open Banking', wise: 'Wise', cash: 'Cash', nowpayments: 'NOWPayments', manual: 'Manual' };

export function profitPaymentGroup(provider: string | undefined, openBanking = false) {
  if (provider === 'stripe' && openBanking) return 'open_banking';
  if (provider === 'crypto' || provider === 'nowpayments') return 'nowpayments';
  if (provider === 'bank_transfer' || provider === 'wise') return 'wise';
  return provider;
}

export function profitMethodTabs(methods: string[]) {
  const groups = new Set(['square', 'stripe', 'open_banking', 'wise', 'cash', 'nowpayments', ...methods]);
  const sorted = [...groups].filter(group => group !== 'open_banking').sort((a, b) => (PROFIT_METHOD_LABELS[a] ?? a).localeCompare(PROFIT_METHOD_LABELS[b] ?? b));
  sorted.splice(sorted.indexOf('wise'), 0, 'open_banking');
  return sorted;
}

export function settledProfitProvider(payments: { provider: string | null; status: string | null }[]) {
  return payments.find(payment => isSettledPaymentStatus(payment.status))?.provider ?? undefined;
}

type MethodPayment = { provider: string | null; status: string | null; provider_payment_id?: string | null };
export function orderPaymentGroup(payments: MethodPayment[], verified: Map<string, boolean>, saved?: string | null) {
  const paid = payments.find(p => isSettledPaymentStatus(p.status));
  if (paid) return profitPaymentGroup(paid.provider ?? undefined, verified.get(paid.provider_payment_id ?? '') === true);
  // An abandoned Stripe session must never override a later chosen payment option.
  if (saved === 'stripe') {
    const bank = payments.some(p => p.provider === 'stripe' && verified.get(p.provider_payment_id ?? '') === true);
    return bank ? 'open_banking' : 'stripe';
  }
  return profitPaymentGroup(saved ?? undefined);
}

export function orderPaymentLabel(group?: string) {
  if (group === 'square') return 'Square card';
  if (group === 'open_banking') return 'Open Banking';
  if (group === 'wise' || group === 'bank') return 'Wise';
  if (group === 'nowpayments' || group === 'crypto') return 'Crypto';
  if (group === 'stripe') return 'Stripe · method unverified';
  return group ? PROFIT_METHOD_LABELS[group] ?? group : '—';
}

export function isOpenBankingSession(session: { payment_method_types?: string[] | null; payment_intent?: unknown }) {
  const intent = session.payment_intent;
  if (intent && typeof intent === 'object' && 'latest_charge' in intent) {
    const charge = intent.latest_charge;
    if (charge && typeof charge === 'object' && 'payment_method_details' in charge) {
      const details = charge.payment_method_details;
      if (details && typeof details === 'object' && 'type' in details) return details.type === 'pay_by_bank';
    }
  }
  return session.payment_method_types?.length === 1 && session.payment_method_types[0] === 'pay_by_bank';
}