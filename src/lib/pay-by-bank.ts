/**
 * Stripe Pay by Bank (open banking) — customer-facing support information.
 *
 * Stripe picks the final bank list inside its own payment picker and can
 * change it at any time, so this is an informational list of the UK banks
 * that appear there, not a guarantee. Every customer also sees the fallback:
 * if their bank is not supported they pay the card invoice instead.
 */
export const PAY_BY_BANK_BANKS = [
  "Bank of Scotland",
  "Chase",
  "Danske Bank",
  "First Direct",
  "Halifax",
  "HSBC",
  "Lloyds Bank",
  "Monzo",
  "Nationwide",
  "NatWest",
  "Revolut",
  "Royal Bank of Scotland",
  "Santander",
  "Starling Bank",
  "TSB",
  "Ulster Bank",
  "Virgin Money",
] as const;

/** Shown under the bank list on the secure checkout page. */
export const PAY_BY_BANK_NOTE =
  "If your bank isn't in the list, it isn't supported yet — use the card invoice instead.";

/** One-line intro above the list. */
export const PAY_BY_BANK_INTRO =
  "Pay from your UK bank account — approve the payment in your banking app and it's confirmed in minutes.";
