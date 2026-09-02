# Fix the "Open LocalSend" button telling you it isn't installed

LocalSend's desktop app does not register a `localsend://` handler with Windows or
macOS, so the browser has nothing to launch. The button's fallback then wrongly
concludes the app is missing — which is what you're seeing even with LocalSend
installed. Browsers also deliberately give no signal about whether a custom link
handler exists, so no amount of detection can make this reliable.

## What changes

- The button keeps trying to launch LocalSend (harmless, and works if a future
  version registers a handler), but when nothing happens it no longer claims the
  app is missing.
- Instead it shows honest guidance:
  "Windows can't launch LocalSend from the browser — open LocalSend from your
  Start menu (or Applications on Mac), then carry on with step 2."
- The Windows/Mac download buttons move under a quieter line —
  "Don't have LocalSend yet?" — so they read as an install option, not an
  accusation that it's missing.
- Button label becomes **Try to open LocalSend** so the wording matches what the
  browser can actually promise.

Steps 2 and 3 of the dialog (download the file, send it over Wi-Fi) are unchanged,
as is everything on the Android side.

## Technical detail

In `src/components/app/LocalSendDialog.tsx`:

- Keep `tryOpenLocalSend`, but rename the fallback state from `launchFailed` to
  `launchUnconfirmed` and change the message it renders to the manual-open guidance
  above rather than an "isn't installed" claim.
- Demote the two download buttons to a secondary row introduced by
  "Don't have LocalSend yet?".
- Update the step 1 heading/body copy accordingly.

No other files, and no changes to talk channels, ticket channels, or the native
LocalSend send/receive flow.
