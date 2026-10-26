# BM TV Enabler PIN login

## What the customer sees
1. On their ticket or order page (in the Remote setup area), the customer presses **Get BM TV Enabler PIN**.
2. A 6-digit PIN appears with a live "valid for 24 hours" countdown. Pressing the button again while it is valid shows the same PIN (no new one), with a "New PIN" option that cancels the old one.
3. Staff viewing the same ticket/order see that a PIN is active and when it expires, but not the PIN itself.
4. In BM TV Enabler (phone and Windows), after the welcome screen and **Get started**, a new **Enter your PIN** screen appears. Nothing else in the app works until a valid PIN is entered.
5. A correct PIN unlocks the app for 24 hours on that device; after expiry the app asks for a PIN again. Wrong PINs show "PIN not recognised" and are limited (5 tries, then a short lockout).

## Rules
- PIN is tied to one ticket or order and the customer who owns it.
- Valid 24 hours from creation; expired or replaced PINs never work.
- Several devices may use the same PIN within its 24 hours (e.g. phone and Windows).
- Both "Install our apps" and "Screen-share support" sit behind the PIN.
- Existing Enabler confirmation-code linking stays as it is.

## Technical details
- New table `enabler_login_pins`: id, ticket_id / order_id, owner user id, pin hash (SHA-256 + salt), created_at, expires_at, revoked_at, failed attempts; RLS: owner read of own row metadata, staff read metadata; writes only through authenticated security-definer RPCs (`create_enabler_pin` for ticket/order owner, returns plaintext once and caches it client-side like `setup-code-store` for refresh).
- Order customers without accounts use the existing link+password server functions to create/read their PIN.
- New public route `/api/public/enabler-login`: POST PIN, rate-limited per IP/device, returns a hashed-stored 24h device token; `/api/public/enabler-confirm` and helper/APK downloads used by the apps then require that token (older app versions keep current behaviour until upgraded? — no: require the token for the new versions only, so existing installs keep working).
- Phone `MainActivity.java` and Windows `renderer/wizard.js`/`renderer.js` get the PIN screen together (kept in step per AGENTS rule); token saved in app storage with expiry.
- Ticket and order Remote setup components get the PIN button/card.
- Tests: PIN expiry at 24h, revoked PIN rejected, attempt limit, ownership check. Release phone 1.30 and Windows 1.20 and make them current downloads.
