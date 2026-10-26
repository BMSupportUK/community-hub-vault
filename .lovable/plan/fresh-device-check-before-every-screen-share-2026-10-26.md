# Fresh device check before every screen share

## How it works for the customer
1. Each time the customer wants screen sharing on a ticket or order, Remote setup asks them to check their TV again. They open BM TV Enabler, which re-checks the TV and skips straight to the finish step when it is still set up. Then they type the new Enabler code on the Remote setup tab.
2. Only after that fresh check does the "Your TV code" box (the six-digit BM Remote Helper code) unlock, and the code is sent to staff.
3. A check counts for **one screen share**, and only for **2 hours**. When that share ends, or 2 hours pass, the tab goes back to "Check your TV again".
4. If the TV has lost a part of the setup (for example the remote-control permission was switched off), the Enabler wizard shows what's missing and fixes it, as it does now.

## What changes
- **Ticket and order Remote setup tabs**: when setup was done before but no fresh check exists, they show "Check your TV again". It has a short note and the Enabler code box. The progress bar and steps reflect the latest check, not the old completion.
- **Helper code**: the website accepts it only when a fresh Enabler check exists that hasn't been used for a screen share yet.
- **Staff view**: shows "Waiting for the customer's TV check" until a fresh check arrives. Staff can't invite before then.
- The apps don't change, because Enabler already re-checks the TV and gives a new code each time.

## Technical details
- Add a nullable `checks_used_at` column (a timestamp) to `ticket_remote_setup` and `order_remote_setup`.
- Add a helper in `src/lib/ticket-remote-setup.ts` that treats the checks as fresh when all four checks pass, `app_checked_at` is within the last 2 hours, and `checks_used_at` is either null or earlier than `app_checked_at`. The UI and `canRequestTicketScreenShare` use this helper instead of `completed_at` alone.
- `verify_ticket_remote_setup` (database function) and `verifyOrderRemoteSetup` refuse a Helper code unless the checks are fresh. On success they set `checks_used_at = now()` along with the existing session link and staff alert.
- When a share ends, nothing extra needs to happen, because the check was already used up when the Helper code was accepted.
- Tests: a check older than 2 hours is not fresh; a check that has already been used is not fresh; a new Enabler check makes it fresh again; staff can't request a share without a fresh check.
