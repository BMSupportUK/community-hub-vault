import { createStripeClient, type StripeEnv } from './stripe.server';
import { squareRequest } from './provider-invoices.server';
import { squareProcessingFee } from './profit-calculation';

export async function fetchProviderFee(provider: string, reference: string, environment: StripeEnv, expectedAmount: number): Promise<number | null> {
  if (provider === 'square') {
    if (reference.startsWith('Invoice #')) return null;
    const { payment } = await squareRequest(`/v2/payments/${encodeURIComponent(reference)}`);
    return payment?.status === 'COMPLETED' && payment.amount_money?.amount === expectedAmount ? squareProcessingFee(payment) : null;
  }
  if (provider !== 'stripe') return null;
  const stripe = createStripeClient(environment);
  let intentId: string | null = null;
  let chargeId: string | null = reference.startsWith('ch_') ? reference : null;
  if (reference.startsWith('cs_')) {
    const session = await stripe.checkout.sessions.retrieve(reference);
    intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  } else if (reference.startsWith('in_')) {
    const payments = await stripe.invoicePayments.list({ invoice: reference, status: 'paid', limit: 100 });
    // Partial/shared charges need separate allocation; never guess their fees.
    if (payments.has_more || payments.data.length !== 1) return null;
    const payment = payments.data[0]?.payment;
    intentId = typeof payment?.payment_intent === 'string' ? payment.payment_intent : payment?.payment_intent?.id ?? null;
    chargeId = typeof payment?.charge === 'string' ? payment.charge : payment?.charge?.id ?? null;
  } else if (reference.startsWith('pi_')) intentId = reference;
  if (intentId) {
    const intent = await stripe.paymentIntents.retrieve(intentId);
    chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id ?? null;
  }
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
  const transaction = typeof charge.balance_transaction === 'string' ? await stripe.balanceTransactions.retrieve(charge.balance_transaction) : charge.balance_transaction;
  return charge.paid && charge.amount_captured === expectedAmount && transaction?.currency === 'gbp' && Number.isSafeInteger(transaction.fee) && transaction.fee >= 0 ? transaction.fee : null;
}