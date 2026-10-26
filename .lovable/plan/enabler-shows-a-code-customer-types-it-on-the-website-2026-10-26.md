# Enabler shows a code, customer types it on the website

## How it works for the customer
1. The customer finishes the wizard in BM TV Enabler (phone or Windows). At the last step the app checks the TV again.
2. When the TV is confirmed, the app shows a **6-character confirmation code**, e.g. `K7P-4QX`. It's valid for 2 hours.
3. On the ticket or order **Remote setup** tab, the customer types that code into a "Confirm with BM TV Enabler" box.
4. The tab ticks the steps the app confirmed and moves on to the six-digit BM Remote Helper code, the same as now.
5. The customer no longer types an 8-digit code into the app. That box is removed from the wizard.

## What changes
- **BM TV Enabler (phone 1.14 and Windows 1.4)**: the finish step asks BM Support for a confirmation code, using the TV checks it just ran, and shows it in large text. A "New code" button gets a fresh one. The "Send TV checks to my ticket or order" box is removed. "Open BM Remote Helper on TV" stays.
- **Ticket and order Remote setup tabs**: the "Your setup code" box is replaced by a "Type the code from BM TV Enabler" box. The rest of the tab is unchanged: progress bar, steps, Helper code, Restart setup.
- Amazon and Android steps stay the same. Only the way the app's result reaches the website changes.
- If the app picked a different TV type from the ticket or order, the website says so and changes nothing.

## Safety
- Codes are stored only as a scrambled (hashed) copy. Each one works once and expires after 2 hours.
- Wrong guesses are limited per ticket or order, and new codes are limited per network.
- A code carries only the TV check results and the TV type. It holds no personal details.

## What you'll need to do
Publish the website. I'll build, sign and upload the phone app as 1.14 and the Windows installer as 1.4 through the same download links. Then test once on a real TV.

## Technical details
- New table `enabler_confirm_codes` (code_hash PK, device, checks jsonb, expires_at, used_at, created_at). Only the service role can access it. It has GRANTs and RLS, with no client policies.
- New public route `POST /api/public/enabler-confirm`. The body is `{ app, device, checks }`. It is rate-limited by IP hash through `tv_helper_diagnostics`. It returns a code from an unambiguous alphabet, which is stored hashed.
- New server functions `redeemTicketEnablerCode` (authenticated, owner/staff ticket access) and `redeemOrderEnablerCode` (token+password via `unlock()`). Each one claims the code in a single update (`used_at is null`, not expired), checks that the device matches, then writes `app_checks`/`app_checked_at` on `ticket_remote_setup` / `order_remote_setup`. Failures are logged to `tv_remote_events` for the attempt limit.
- `/api/public/remote-setup` and the 8-digit issue flow are kept for older app versions but no longer shown in the UI. `setup-code-store.ts` is unused by the new UI.
- Phone: `Enabler.requestConfirmCode()` and the MainActivity DONE step, with SetupWizard unchanged. Windows: `core.cjs requestConfirmCode()`, a `bm:confirm-code` IPC call and renderer DONE step changes. Both change together, per AGENTS.md.
- Tests: the code expires after 2 hours, is used only once, and a device mismatch is rejected. Plus updated wizard and enabler tests.
