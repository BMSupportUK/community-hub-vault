# Send apps to Fire Stick / Android box with LocalSend

Add a "Send over Wi-Fi (LocalSend)" option to the BM App Store so a member can push
an app straight onto their Fire Stick or Android box from the BM Support Android
app — no Downloader, no typing URLs.

This works by speaking the LocalSend protocol from inside our own Android app.
The TV device just needs LocalSend already installed and open (assumed).
In a normal web browser the button explains that this needs our Android app and
falls back to today's QR + 24-hour download link.

## What the member sees

1. In BM App Store (inside the BM Support Android app), pick an app and tap
   **Send over Wi-Fi**.
2. A dialog scans the local network and lists LocalSend devices it finds, with the
   device name/model shown on the TV.
3. Tap the device. On the TV, LocalSend shows an "Accept file?" prompt — the dialog
   tells them to press Accept with the remote.
4. Progress bar: Preparing > Waiting for accept > Sending 43% > Sent.
5. On success: "Sent to Fire TV Stick 4K — on the TV, open LocalSend's received
   files and tap the APK to install."
6. Plain-English errors for: LocalSend not open on the TV, request declined,
   phone and TV on different networks, transfer interrupted.

Access matches today's download links (subscriber, staff, admin, management) and
uses the member's own existing expiring transfer link — nothing new is exposed.

## Phasing

- Phase 1 — full feature: native LocalSend plugin (discovery + send), dialog UI,
  progress, errors, and a new signed APK build so members actually get it.
- Phase 2 (after you test) — remember previously used devices for one-tap resend,
  and log Wi-Fi sends alongside the existing download tracking.

## Technical detail

**New Capacitor plugin `LocalSend`** in
`android/app/src/main/java/uk/bmsupport/app/localsend/`, registered from
`MainActivity.java`:

- `scan()` — LocalSend v2 discovery: multicast UDP announce to `224.0.0.167:53317`
  plus a bounded HTTP `/api/localsend/v2/register` sweep of the phone's /24 subnet
  as a fallback for TVs that block multicast. Emits `localSendDevice` events
  (alias, deviceModel, ip, port, protocol, fingerprint) so the list fills live.
- `send({ deviceIp, port, protocol, url, fileName, size })` —
  `POST /api/localsend/v2/prepare-upload` with our session/file metadata, waits for
  the TV to accept, then streams the APK to
  `/api/localsend/v2/upload?sessionId&fileId&token`. Emits `localSendProgress`
  events; resolves on completion.
- `cancel()` — calls `/api/localsend/v2/cancel` and aborts the stream.
- APK bytes are streamed from the member's existing signed transfer URL, so the
  file never needs to be fully buffered in memory.
- LocalSend uses self-signed HTTPS; the client pins to the discovered fingerprint
  and otherwise trusts that cert only for this call (no global trust changes).
  Falls back to the HTTP variant when the device advertises `protocol: "http"`.
- Manifest: `ACCESS_WIFI_STATE`, `ACCESS_NETWORK_STATE`, `INTERNET`, and a
  `MulticastLock` held during discovery only.

**Web side**

- `src/lib/localsend.ts` — thin typed wrapper around the plugin with a
  `isLocalSendAvailable()` check (Capacitor native + Android only).
- `src/components/app/LocalSendDialog.tsx` — device list, scan state, progress bar,
  accept-on-TV guidance, error states.
- `src/components/app/AppTransferPanel.tsx` — new "Send over Wi-Fi" button on each
  app card next to "View download link", shown only when a valid transfer exists;
  on non-native it opens a short explainer pointing at the QR flow.

No changes to talk channels, ticket channels, chat counters, or presence code.
