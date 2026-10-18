# £1 Pay by bank test

The aim is to check that a real bank payment through Stripe's Pay by bank goes through, without changing anything for customers.

## Steps
1. Create a £1 demo order. Its invoice goes to the demo email (bmsupport2022@protonmail.com), never a customer's email.
2. Turn on Stripe Pay by bank for this one demo order only. Stripe stays hidden for every customer, and Square stays the card option.
3. Send you the order's secure link and password so you can pay £1 from your own banking app.
4. After you pay, check the result. Either Stripe marks it paid and the order updates by itself, or I report exactly where it was refused (your bank or Stripe).
5. Delete the demo order and its payment records so they don't show in Profit & costs. The £1 stays in Stripe and can be refunded there.

## Technical details
- Demo-order flag on the checkout link allows the Stripe invoice with `us_bank_account`-free UK `pay_by_bank` method only; normal orders still map Stripe requests to Square.
- Use the existing shared invoice creation and webhook. No changes to the locked video, ticket or Talk code.
- Clean up afterwards using the same deletion steps used for the earlier demo orders.
