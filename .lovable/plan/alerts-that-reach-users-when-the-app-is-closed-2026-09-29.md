# Alerts that reach users when the app is closed

## Goal
Make sure users get alerted even when the BM Support app or website is fully closed — both on the Android app and in the browser.

## What already exists (confirmed in the code)
- The Android app already receives push alerts when closed or in the background (Firebase), with sound, and tapping one opens the app.
- The website already supports browser push notifications that arrive even when the site tab is closed — but each user must switch them on themselves (the notifications toggle in their settings), and it only works on the real published site, not the preview.

## What will change
1. **Check every alert type fires when closed.** Go through each notification the app sends (new tickets, ticket replies, mentions, signups, orders, shift alerts) and confirm each one sends a real push to closed devices — not just an on-screen popup. Fill any gaps so every important alert also goes out as a push.
2. **Make alerts impossible to miss on Android.** Confirm alerts are sent as high-priority so the phone wakes, lights up and plays sound even from a fully closed app.
3. **Tapping an alert opens the right page.** When a user taps a notification, the app/site opens directly on the relevant screen (the ticket, the chat channel, etc.) instead of just the home page.
4. **Test end-to-end.** Send a real test alert to a closed app and a closed browser and confirm it arrives, sounds, and opens the right place.

## Technical details
- Review all call sites of `pushToUser` / `pushToRoles` / `pushToAdmins` / `pushToAllDevices` in `src/lib/fcm.server.ts` and the web-push sender, and add missing pushes where an alert currently only shows in-app.
- Keep FCM `priority: "HIGH"` / `PRIORITY_HIGH` (already set) and verify web push payloads carry the target `url` so `notificationclick` in `public/sw.js` opens the right page.
- No changes to Talk or ticket channel code beyond adding push triggers where missing.
- Verify with a real test notification, then clean up test data.
