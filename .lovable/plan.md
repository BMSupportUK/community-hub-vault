# Customer Sales Portal

Every customer (site-account and manual) gets their own private portal page with a link that is unique to them. To get in, they ask for a login link that goes to their saved email and works for 24 hours.

## What the customer sees

1. **Portal link** — `bmsupport.uk/portal/<their-unique-code>`. The page shows a "Send me a login link" button and nothing private.
2. **Login link email** — sent to the email on their customer record. One click opens the portal; the link stops working after 24 hours or when a newer one is requested. Requests are rate-limited.
3. **Inside the portal** (tabs):
   - **Shop** — same layout as the current Shop: browse, add to basket, place the order and pay. Orders placed here go onto that customer's record and appear in the portal's **My Orders** using the existing order cards.
   - **My Logins** — every app login they have (username, server/app, expiry). Passwords stay hidden until they enter their PIN, then show for ten minutes with copy buttons. This reuses the PIN and ten-minute viewing they already have.
   - **Install Guides** — the current Install Guides page moved in exactly as it looks now.
4. **Sign out** button, plus automatic sign-out when the 24 hours run out.

## What admin and management see

- On each Customers card: **Copy portal link** and **Reset link** (makes a new code so the old link stops working).
- Staff can copy the link but can't reset it.
- The customer's email stays hidden from everyone except admin and management, as now.

## Things that stay the same

- Site-account customers can still sign in to the main site normally; the portal is an extra way in.
- Order passwords for secure checkout, payment options, video help and the existing Install Guides page for members are left unchanged.
- Test and hidden accounts don't get portals.

## Open point

Customers with no email saved can't request a login link; their card will show "Add an email to enable the portal".

## Technical details

- New tables: `customer_portals` (customer key, hashed portal code, created/reset timestamps) and `customer_portal_sessions` (hashed magic token, expires_at = now + 24h, used_at, hashed session token). Grants + RLS with no client access; all access through server functions.
- Server functions (`src/lib/customer-portal.functions.ts`): `requestPortalLink` (public; looks up the portal, always returns the same response, rate-limits, emails a one-use token through a new `customer-portal-link` app email template), `redeemPortalLink` (exchanges the token for an httpOnly session cookie that expires at the 24h mark), and session-checked readers/writers for shop products, placing orders, own orders, logins (PIN-gated via existing manual credentials RPC logic) and guides.
- Orders placed in the portal are created with the customer's `user_id` (site users) or manual customer link, reusing the existing order-creation and payment notification paths.
- Install guide body extracted from `install-guides.tsx` into a shared component, rendered unchanged in both places; shop catalog/basket similarly shared.
- Admin RPCs for copy/reset portal link with role checks (admin/management reset, staff read).
- Public route `src/routes/portal.$code.tsx` with noindex head metadata.
- Tests: link expires at 24h, new link invalidates old, reset code invalidates old link, staff cannot reset, PIN required before passwords show.
