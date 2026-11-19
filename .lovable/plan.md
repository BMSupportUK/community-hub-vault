# Set up or renew provider accounts from secure checkout

## What you'll get
On a paid order's staff secure checkout page, a **Set up account** button (new customers) or **Renew account** button (renewals) appears. Pressing it asks staff to confirm, then the website signs in to your Xtream provider panel and:
- **New customer:** creates the line with a username and password, the package length (1, 6 or 12 months), the right number of connections (single, Multi Room, Triple Room), and the category list. If the customer chose no adult content, the adult categories are left unticked.
- **Renewal:** finds the customer's existing line and extends it by the package length. Adult categories are updated to match what they chose on this order.

The new login and end date are saved to the customer's subscription, just like staff entering them by hand. The result goes in the order chat as "Account created" or "Account renewed". If the panel refuses, staff see the panel's reason and nothing is half-saved. The button works once per order, so double presses can't make two lines or extend twice.

## First step: check the panel connection
When I tried to open your panel, it returned "authorisation required" before showing the sign-in page. Before building anything I'll:
1. Ask you for the panel login through a secure form, never in chat.
2. Check whether your panel has a reseller API key option (most Xtream panels do, under your profile). That is safer and more reliable than signing in to the web page.
3. Check whether the panel only lets in certain internet connections. If it does, the website's connection may need adding to its allow list, or the provider may need to add it.

If none of these work, I'll stop and tell you what the provider needs to change.

## Who can press it
Admin and management only. Staff can still view the order, chat and share their screen, which matches the existing checkout rules. Tell me if staff should be able to press it too.

## Technical section
- Server-only module `src/lib/provider-panel.server.ts`: reseller API calls through a custom connector if the panel has an API key; otherwise a logged-in session using stored secrets. Panel credentials are never sent to the browser.
- `src/lib/provider-panel.functions.ts`: `providerSetupLine({ orderId })`, behind requireSupabaseAuth with an admin/management role check. It checks the order is paid and not yet provisioned, then takes a per-order lock.
- Category mapping: read the panel's bouquet list once and store which bouquets are adult in a small settings table (admin-editable in Owner Tools). The line is created with all bouquets, minus the adult ones when adult content is "no".
- Store the result in a new `order_provisioning` row (order_id unique, line id, status, error). Write the credential and expiry through the existing credential save path, so the profile/credential separation and renewal-expiry rules still apply.
- Tests: once per order (a second call does nothing); adult "no" leaves out the adult bouquets; renewal extends by the sale length; non-admin is refused.
