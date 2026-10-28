# Ask the setup questions on the website, then hand off to BM TV Enabler

Yes, this makes more sense. Customers answer the easy questions on the website, where they're already signed in. The Enabler then only does the TV work it has to do.

## What the customer sees

On the website (Install Guides, or the order/ticket "Need help?" bar), a short wizard with a progress bar:

1. **What do you need?** Install our apps / Screen share help
2. **Which TV?** Amazon Fire TV / Android / Google TV
3. **Do you need staff help?** (only shown for app installs; greyed out outside office hours)
   - **Yes:** the website opens the support ticket straight away. Staff install the apps over screen share.
   - **No:** the customer picks the apps to install, with all ticked by default.
4. **Open BM TV Enabler**: shows a short handoff code (and a QR code on phones). The customer enters it in the Enabler, which loads all their answers.

In BM TV Enabler, the questions are gone when a handoff code is used. It goes straight to switching debugging on, finding the TV, connecting, then either installing the chosen apps or setting up screen sharing for the ticket. The app's own questions stay as a backup for customers who open it without a code.

## What stays the same

- The login PIN, sharing references, office-hours rule, download logging for self-installs, and staff-ticket screen-share setup.
- Already-installed apps still show greyed out and unticked. The Enabler checks the TV and skips apps that are already there.

## Technical details

- New table `enabler_handoffs`: user_id, purpose (install/share), device, help_plan, chosen app packages, ticket_id/order_id, a hashed 6-digit code, expiry after 2 hours, and used_at. RLS lets the owner create and read their own rows.
- Authenticated server function to create a handoff. For staff help it creates the General ticket first, reusing the logic in `enabler-staff-help`.
- Public route `/api/public/enabler-handoff`, POST with the code and the PIN token. It returns the answers and marks the code used. It checks that the PIN belongs to the same user.
- Phone (`MainActivity`) and Windows (`renderer.js`) get an "I have a website code" entry. It pre-fills apps, device, helpPlan and the app selection, then jumps to the debugging step.
- Release Phone Enabler 1.61 and Windows 1.51 (this includes the unreleased staff-help "skip install" change from 1.60/1.50).
- Tests for: the code expires after 2 hours, can only be used once, and only works with the owner's PIN.
