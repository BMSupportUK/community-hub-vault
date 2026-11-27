# Referral credit

When a **new customer** you referred completes and pays for their **very first order**, money gets added to your BM Support account as credit.

## Suggested reward table
Based on £5 for a Single 12 month sale (about 8% of £65):

| Package the new customer buys | Price | Referrer gets |
|---|---|---|
| Single User, 12 months | £65 | **£5** |
| Multi Room, 12 months | £115 | **£9** |
| Triple Room, 12 months | £165 | **£13** |
| Single User, 6 or 1 month | £49 / £15 | Nothing (only 12 month packages count, like the free month today) |

## What gets built
- **Referrals page** (customer portal and staff side rail): your referral link, a table of these rewards, your credit balance, and a list of people you referred and what each one earned (waiting / added).
- **Credit is added automatically** only for the referred new customer's very first order, once it's completed and paid. Renewals and later orders never earn credit. If that first order is a 6 or 1 month package, no credit is earned, even if they buy a 12 month one later. It's only added once per sale, never for demo orders, and never when GJ or DaneJ referred them (same as the free-month rule).
- **Spending credit:** at checkout the customer can choose to take their credit off the price. If an order is cancelled or refunded, the credit goes back.
- **Admin dashboard:** each customer card shows their credit balance. Admin and management can add or remove credit by hand, and must give a reason.
- **The admin "free month" button for referrals is replaced** by this credit for new referrals. Bonuses already marked as added stay as they are.

## Technical details
- New tables: a referral-credit ledger (one row per credit/debit, unique per qualifying order) plus reward amounts in app settings so they can be changed later. Grants plus row-level security: owners can read their own rows, admin/management can read and adjust all.
- A database trigger runs when an order completes, reusing the existing referrer capture.
- Checkout applies credit through an authenticated database function that locks the balance, so it can't be spent twice.
- Tests for the £5/£9/£13 amounts, the 12-month-only rule, the GJ/DaneJ exclusion and no double payout.
