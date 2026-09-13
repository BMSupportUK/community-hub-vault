# Hold the BM Support loading screen on app return

## What will change
- Show the existing BM Support logo and loading spinner immediately whenever the app leaves the foreground.
- Keep that loading screen visible for 10 seconds after returning to the app.
- Check the saved lock and inactivity state during that delay, then reveal either the lock screen or the protected area.
- Cancel stale timers so repeated background and foreground events cannot cause flicker or reveal content early.

## Technical details
- Extend the existing resume gate in `ScreenLockProvider`; no Talk or ticket channel code will change.
- Preserve the current lock-code and authenticator unlock behavior.
- Verify the build and the background/return transition.
