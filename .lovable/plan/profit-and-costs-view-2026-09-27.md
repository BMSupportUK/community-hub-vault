# Profit and costs view

## What you get
- A **Profit & costs** button at the top of the **Order status** tab in the admin dashboard (next to the year tabs). It opens a full profit view.
- **Product costs** section: a list of every shop product with its selling price and a box to enter what it costs you. Save per product. Admin and management only.
- **Profit breakdown**: year tabs, then month tabs (same style as Order status). For each month:
  - Revenue (paid/completed orders only), total costs, profit, and profit margin %.
  - A row per order: date, customer, products bought, revenue, cost, profit.
  - Year summary at the top: totals for the year plus a month-by-month mini table.
- Cancelled and unpaid orders are left out of profit.

## How costs are worked out
- Each order line's cost = product cost x quantity bought.
- The cost is **locked onto each order line when the order is bought**, so changing a product's cost later won't rewrite past months. Existing orders are filled in using today's cost you enter.
- If a product has no cost entered yet, it's flagged "cost missing" so profit isn't overstated silently.

## Technical details
- Migration: add `cost_cents integer` (nullable) to `public.products`; add `unit_cost_cents integer` (nullable) to `public.order_items`; trigger on `order_items` insert copies the product's current cost; column-level access so only admin/management can read/update costs (costs stored in a separate `product_costs` table with RLS via `has_any_role(admin, management)` rather than on the public products row, so customers never see them). Order items get a nullable cost snapshot column filled by a security-definer trigger.
- Backfill: when a cost is first saved for a product, fill `unit_cost_cents` on past order items that have none.
- New `src/components/app/ProfitCostsDialog.tsx` (costs editor + year/month profit tabs), opened from a button in `OrderStatusAdminCard.tsx`.
