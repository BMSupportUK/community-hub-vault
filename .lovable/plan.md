# Helper code fills in automatically, customer just presses Connect

## How it works for the customer
1. BM TV Enabler finishes setup and opens BM Remote Helper on the TV (as now).
2. The Enabler reads the six-digit code BM Remote Helper is showing, straight off the TV. Nobody types it.
3. The customer gets the Enabler confirmation code (as now) and types it on the ticket or order Remote setup tab.
4. The tab now says "Your TV is ready" with one big **Connect** button. Pressing it sends the screen-share request to staff, the same as typing the TV code does today.
5. If the Enabler couldn't read the code, or BM Remote Helper's code has expired (it lasts a few minutes), the tab shows the six-digit box as it does now, so the customer can still type it by hand.

This works well with the new rule of a fresh TV check before every screen share: each new Enabler check also brings a fresh Helper code.

## What changes
- **BM TV Enabler (phone 1.17, Windows 1.6):** after opening BM Remote Helper, it reads the code from the TV screen and sends it along when it asks for the confirmation code. The rest of the wizard stays the same.
- **Ticket and order Remote setup tabs:** after the Enabler code is accepted, they show a Connect button when a live Helper code came with it. Otherwise they fall back to the six-digit box.
- **Staff:** no change. They get the same request and alert.

## Safety
- The Helper code is never stored or shown on the website. Only its scrambled (hashed) copy travels with the single-use Enabler code, which expires after 2 hours.
- Connect only works for the customer of that ticket or order. It still requires the fresh TV check, and only while that TV session is still waiting.

## Technical details
- Enabler reads the code with `uiautomator dump` over ADB, then takes the six-digit number from the BM Remote Helper window. `Enabler.readHelperCode()` in the phone app and `readHelperCode()` in `core.cjs`, with a short retry while the app opens.
- `POST /api/public/enabler-confirm` accepts an optional `helperCode`. It hashes the code, looks up the matching pending `tv_remote_sessions` row and saves its id on a new nullable column, `enabler_confirm_codes.session_id`.
- When the Enabler code is redeemed (`redeem_ticket_enabler_code` and `redeemOrderEnablerCode`), that session id is copied to a new nullable column, `pending_session_id`, on `ticket_remote_setup` and `order_remote_setup`.
- New Connect actions: a `connect_ticket_remote_setup(_ticket_id)` database function, and a `connectOrderRemoteSetup` server function. Each reuses the existing verify logic, using the stored session instead of a typed code: the check must be fresh, the session must be pending and not expired, then link it, alert staff and mark the check used.
- Tests: Connect is refused without a fresh check, refused for an expired or used session, works once, and the typed six-digit box still works.
- Risk: some TVs may not allow screen reading over debugging. If so, the six-digit box is shown as today.
