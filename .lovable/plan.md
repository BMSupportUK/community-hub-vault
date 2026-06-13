## Goal
Make every email the app sends come from your own `bmsupport.uk` domain instead of Lovable's default templates/sender.

## Current state
- App emails (notifications, 2FA reset, subscription expiry, prediction reminders, WC guest PIN reset) are **already** sending from `BM Support <noreply@bmsupport.uk>` via the verified `notify.bmsupport.uk` sender. No change needed here.
- **Auth emails** (signup confirmation, password reset, magic link, invite, email change, reauthentication) still use Lovable's default templates and sender. This is what's making "prediction" sign-up / login emails appear to come from Lovable.

## Plan
1. Scaffold the 6 standard auth email templates into `src/lib/email-templates/` (signup, magic-link, recovery, invite, email-change, reauthentication) using the verified `notify.bmsupport.uk` sender.
2. Apply your existing brand styling (dark theme, BM Support look, primary accent) to the scaffolded templates so they match the rest of your app emails.
3. Templates deploy automatically with the next publish. DNS is already verified, so auth emails will start sending from `bmsupport.uk` immediately.

## Notes
- I will not change any existing app-email senders — they are already correct.
- No DB migrations are required; email infrastructure is already set up.
- The "prediction reminder" cron and WC guest PIN reset emails will continue to send from `noreply@bmsupport.uk` as before.
