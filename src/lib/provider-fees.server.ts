import { createStripeClient, type StripeEnv } from './stripe.server';
import { squareRequest } from './provider-invoices.server';
import { squareProcessingFee } from './profit-calculation';

export async function fetchProviderFee(provider: string, reference: string, environment: StripeEnv, expectedAmount: number): Promise<number | null> {
  if (provider === 'square') return fetchSquareFee(reference, expectedAmount);
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
// Square references may be a payment id, an invoice id (inv:...) or a manual "Invoice #N" note.
async function fetchSquareFee(reference: string, expectedAmount: number): Promise<number | null> {
  let paymentIds: string[] = [];
  const numberMatch = reference.match(/^Invoice\s*#\s*(\d+)$/i);
  let invoiceId = reference.startsWith('inv:') ? reference : null;
  if (numberMatch) {
    const wanted = Number(numberMatch[1]);
    let cursor: string | undefined;
    const location = process.env.SQUARE_LOCATION_ID;
    if (!location) return null;
    do {
      const page = await squareRequest(`/v2/invoices?location_id=${encodeURIComponent(location)}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      const found = (page.invoices ?? []).filter((i: any) => Number(i.invoice_number) === wanted);
      if (found.length > 1) return null;
      if (found.length === 1) { invoiceId = found[0].id; break; }
      cursor = page.cursor;
    } while (cursor);
    if (!invoiceId) return null;
  }
  if (invoiceId) {
    const { invoice } = await squareRequest(`/v2/invoices/${encodeURIComponent(invoiceId)}`);
    if (invoice?.status !== 'PAID' || !invoice.order_id) return null;
    const { order } = await squareRequest(`/v2/orders/${encodeURIComponent(invoice.order_id)}`);
    paymentIds = (order?.tenders ?? []).map((t: any) => t.payment_id).filter(Boolean);
  } else paymentIds = [reference];
  if (!paymentIds.length) return null;
  let total = 0;
  let amount = 0;
  for (const id of paymentIds) {
    const { payment } = await squareRequest(`/v2/payments/${encodeURIComponent(id)}`);
    if (payment?.status !== 'COMPLETED') return null;
    const fee = squareProcessingFee(payment);
    if (fee == null) return null;
    total += fee;
    amount += payment.amount_money?.amount ?? 0;
  }
  return amount === expectedAmount ? total : null;
}
