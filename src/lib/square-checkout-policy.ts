export type SquarePayment = {
  id?: string; status?: string; reference_id?: string; location_id?: string;
  amount_money?: { amount?: number; currency?: string };
  card_details?: { card?: { card_brand?: string; last_4?: string } };
  processing_fee?: { amount_money?: { amount?: number; currency?: string } }[];
};

export function squarePaymentMatches(payment: SquarePayment, orderId: string, amount: number, locationId: string) {
  return Boolean(payment.id && payment.reference_id === orderId && payment.location_id === locationId &&
    Number.isSafeInteger(amount) && amount > 0 && payment.amount_money?.amount === amount && payment.amount_money.currency === 'GBP');
}

export function squarePaymentCompleted(payment: SquarePayment, orderId: string, amount: number, locationId: string) {
  return payment.status === 'COMPLETED' && squarePaymentMatches(payment, orderId, amount, locationId);
}

export function squareFailureIsDefinitive(status: number) {
  return status >= 400 && status < 500 && ![408, 409, 429].includes(status);
}