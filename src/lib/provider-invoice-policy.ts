export function invoiceCanBeReused(status: string, amount: number, expected: number, url: string | null) {
  return !!url && amount === expected && ['open', 'unpaid', 'scheduled', 'payment_pending', 'partially_paid'].includes(status.toLowerCase());
}
export function invoiceIsSettled(status: string, total: number, paid: number, currency: string, expected: number) {
  return status.toLowerCase() === 'paid' && Number.isSafeInteger(expected) && expected > 0 && total === expected && paid === expected && currency.toUpperCase() === 'GBP';
}
