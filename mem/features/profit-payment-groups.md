---
name: Profit payment groups
description: Profit and costs payment-method grouping and labels
type: feature
---
In Profit & costs, group both `crypto` and `nowpayments` orders under **NOWPayments**. Group both `bank_transfer` and `wise` orders under **Wise**. Do not show separate Crypto or Bank transfer breakdown tabs.
Open Banking has its own Profit & costs breakdown tab immediately before Wise, showing its sales, actual provider fees and net profit separately from our own bank transfers.
Orders payment method names must be Open Banking, Wise, Square card or Crypto according to the actual payment used, not a generic Stripe/card-or-bank label or an abandoned payment attempt. Unknown Stripe methods must remain explicitly unverified, never guessed.