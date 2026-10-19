
## Supported banks (GoCardless go-live task)
- When GoCardless is switched on, the Pay by bank supported-bank list comes from GoCardless's institutions endpoint, filtered to the customer's country.
- If the customer's bank isn't listed: card orders fall back to Square card invoice; bank-transfer (Wise) orders fall back to our own internal bank details with the order-number reference warning.
- Stripe's existing bank list stays in use while Stripe is the provider.
