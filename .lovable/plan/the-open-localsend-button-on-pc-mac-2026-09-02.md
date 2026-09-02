# The "Open LocalSend" button on PC/Mac

Straight answer first: a web page cannot start LocalSend on your computer. Browsers
only launch a desktop app when that app registers a custom link handler (like
`zoommtg://` or `spotify://`), and LocalSend deliberately does not register one —
the request for a `localsend://` scheme was raised with the LocalSend project and
closed without being implemented. So there is nothing for the button to call, and
the browser gives no signal back either, which is why it wrongly reports
"Couldn't find LocalSend".

This is not a bug in our code and no amount of extra work here will make it launch.
The fix is to stop pretending it can.

## What changes

- Remove the **Open LocalSend** button and the false "Couldn't find LocalSend"
  warning from step 1 of the Send over Wi-Fi dialog.
- Step 1 becomes: "Open LocalSend on your Windows / Mac — find it in your Start menu
  (or Applications) and leave it running."
- Underneath, a quieter line — "Don't have it yet?" — keeps the existing Windows and
  Mac download buttons.
- Steps 2 (download the file) and 3 (send it to the TV) stay exactly as they are.

## If you want it to be one click later

The only way to get true one-click launching from the browser is a small installed
BM Support helper on the PC/Mac that registers its own link handler. That is a
separate desktop build (and, on Windows, a code-signing certificate) — worth doing
only if you want a proper BM Support desktop app anyway.

## Technical detail

`src/components/app/LocalSendDialog.tsx` only: delete the `tryOpenLocalSend` helper,
the `launchFailed` state and its button/warning, and reword the step 1 block. No
other files; nothing in the native Android send/receive path, talk channels, or
ticket channels is touched.
