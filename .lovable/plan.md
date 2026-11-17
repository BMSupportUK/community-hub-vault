# VPN bought inside BM Player only

## What customers will see
- **In BM Player** (Android box, Fire TV, phone, Windows, Mac): when the VPN hasn't been bought, the VPN button on the home screen and Settings › VPN show **"Get VPN – £2/month"**.
- Pressing it shows the price, how many months it covers and when it ends.
- **Price:** £2 for each month left on the customer's subscription, with part months counted as a whole month. The VPN ends on the same day as the subscription, so the two always match.
- **Paying:** the box shows a QR code and a short code, and the customer scans it with their phone. A short private pay page opens with the existing **Pay by bank** and **Card (Square)** choices. Phones and computers can open the same page directly with a "Pay now" button.
- As soon as the payment completes, the box shows "VPN ready". The VPN stays off until the customer turns it on with the VPN button, as it does now.
- **Renewal:** when a subscription is renewed, the VPN switches off at the old end date. BM Player then offers "Get VPN" again for the new period. The website no longer asks "Keep your VPN?".

## Removed from the website
- The VPN checkbox in the Shop basket, and the VPN line in order totals for new orders.
- The "Keep your VPN?" question at renewal checkout.
- Existing paid VPNs stay as they are until their end date. Admin allocation in the BM Player dashboard stays for staff and test accounts.

## Records and money
- Each app purchase is saved as its own small paid order, "VPN add-on (N months)", under the customer. It shows in Orders and Profit with provider fees picked up like other sales.
- A VPN login is created only after payment completes, matching the current rule.

## Technical details
- New `vpn_purchases` table: device, credential, owner, months, pence, status, token hash, order id. RLS is owner-read; writes go through the service role only.
- New device-token actions `vpn_quote` (months left and price) and `vpn_buy` (creates a pending order and returns a short-lived pay token and QR URL) in `src/routes/api/public/player.ts`. The `vpn_status`/`vpn` reply changes its offer to `buy`.
- The pay page reuses the existing `/pay/$token` checkout with a VPN-only order. On completion, an existing markPaid hook sets `vpn_subscriptions` active with source `app`. `vpnEntitlement` is unchanged, because the end date is the subscription's.
- Shop (`_authenticated/_approved/shop.tsx`) and the renewal flow drop the VPN UI. `vpnAddonMonths` stays for old orders.
- Android: a BoxVpn "Get VPN" dialog with a QR code and polling (new `VpnBuyDialog.java`). Desktop: the matching dialog in `vpn-controls.jsx`. Release box 6.11, Windows and Mac.
- Tests for the pricing (months left, rounded up, £2 each) and for the purchase activating only once payment completes.
