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