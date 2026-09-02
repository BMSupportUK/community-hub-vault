# Send a link to your Fire Stick or Android device

Yes — this is possible over your local Wi-Fi, using the same sending system that already pushes the app file to your TV. A link is just a tiny text payload, so it arrives instantly.

## What you'll get

- In the existing **Send over Wi-Fi** dialog, a new **Send a link** field: type or paste any URL, pick the device from the scanned list, hit send.
- On a device running **BM Support** (Fire Stick, Android box, phone): an on-screen prompt shows the link with **Open** and **Dismiss**. Open launches it in the device's browser (Silk on Fire TV, Chrome on Android). A prompt is used rather than silent auto-open so nothing hijacks the screen unexpectedly.
- On a device running the **official LocalSend app**: the link arrives as a normal text message, which LocalSend displays and lets the user copy/open. No changes needed on their side.
- Progress/errors reuse the current send feedback; sending is near-instant.

## How it works

- **Sender (native plugin, `LocalSendPlugin.java`)**: add a `sendText(deviceIp, port, protocol, text)` action. It uses the standard LocalSend flow — `prepare-upload` with a single file entry of `fileType: "text/plain"` and the URL as the file body, then streams the bytes to `/upload`. Same TLS/certificate handling already in place, so no new handshake issues.
- **Receiver (`LocalSendReceiver.java`)**: it already accepts `prepare-upload` + `/upload`. Add a text branch: when the incoming file is `text/plain` and small, read it into memory instead of writing an APK, and emit a `localSendReceive` event with `phase: "text"` and the content.
- **Web layer (`src/lib/localsend.ts`)**: extend the plugin interface with `sendText` and add `"text"` to `LocalSendReceiveEvent` with a `text` field.
- **UI**:
  - `LocalSendDialog.tsx` — a link input plus "Send link" alongside the existing "Send app file" action for the selected device, with basic URL validation (`http`/`https` only).
  - `LocalSendReceiverBridge.tsx` — on a `text` event, show a dialog with the link, **Open** (native browser via `ACTION_VIEW`) and **Dismiss**.

## Not included

- Sending to devices that aren't running BM Support or LocalSend (e.g. a bare Fire Stick with nothing installed) — there's no protocol to reach them.
- Remotely forcing the TV to open a page without confirmation.
