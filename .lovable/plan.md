# Make notifications pull you back to BM Support

## The honest limit
Browsers do not allow any website to force itself in front of whatever you're doing — that's a hard browser rule, not something we can code around. What we CAN do is make alerts impossible to miss, and make getting back to the app one tap.

## What already works (confirmed in the code)
- Clicking a notification already focuses the BM Support window if it's open, or reopens it if the browser was closed — and it opens on the exact page the alert is about.
- Alerts already arrive when the browser is fully closed, with sound.

## What will change
1. **Sticky alerts.** Important notifications (tickets, mentions, ticket replies) stay on screen until you actually click or dismiss them, instead of vanishing after a few seconds while you're busy in another window.
2. **Stronger sound + vibration pattern** on these alerts so they cut through when the PC is in use.
3. **One-tap return.** Keep and verify the existing behaviour: clicking the alert focuses the open BM Support window (or opens a new one) directly on the right page.
4. **Test it.** Send a real test notification with the browser minimised and confirm it stays on screen, sounds, and clicking it brings the app forward on the right page.

## Technical details
- Add `requireInteraction: true` (and keep `renotify`/vibrate) for high-priority kinds in `public/sw.js` push handler, keyed off the payload's `kind` so minor alerts still auto-dismiss.
- Verify `notificationclick` focus/navigate path still works; no changes to Talk or ticket channel code.
- Web push only works on the published site (bmsupport.uk), not the preview, and each user must have notifications switched on in their settings.
