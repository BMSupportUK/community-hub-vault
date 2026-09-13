# Hide App Content Before Screen Lock

## What will change
- Move the screen-lock check out of the delayed extras so it runs before protected page content appears.
- Show the BM Support loading screen while saved lock settings and inactivity are being checked.
- Cover the app with the loading screen whenever it goes into the background, then reveal either the lock screen or the page after the resume check finishes.
- Keep the existing lock code, authenticator, sign-out, reset, and section-aware lock-screen behavior unchanged.

## Technical details
- Turn `ScreenLockProvider` into the gate around approved content.
- Treat a saved locked flag or an already-expired activity timestamp as blocked synchronously, preventing a one-frame page reveal.
- Remove the delayed duplicate provider from `ApprovedDeferredExtras`.
- Verify cold reload and background/resume behavior with the preview and confirm the build remains clean.
