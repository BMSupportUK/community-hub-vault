# Start the download in Downloader automatically

Right now a member reads the 24-hour short link off the QR card and types it into
Downloader on the Fire Stick. This makes that typing unnecessary in two ways:

1. **On the TV** — when BM Support is open on the Fire Stick / Android box, a
   "Open in Downloader" button hands the link straight to Downloader, which starts
   downloading the APK immediately.
2. **From your phone** — the phone can tell the TV (running BM Support on the same
   Wi-Fi) to start that Downloader download, so nothing is typed on the TV at all.

## What the member sees

On the TV (BM Support open):
- In the download options popup, a new **Open in Downloader** button next to
  *Download to this device* and *Send over Wi-Fi*.
- Tapping it launches Downloader with the link already filled in and the download
  running. Downloader then offers Install when it finishes.
- If Downloader isn't installed, a short message points at the Amazon Appstore /
  Play entry for it, with the typed short code as the fallback.

On the phone:
- The existing **Send over Wi-Fi** dialog gains a second action per discovered TV:
  **Start in Downloader** alongside **Send**.
- Tapping it shows "Starting Downloader on Fire TV Stick 4K…" then "Downloader is
  downloading — press Install on the TV when it finishes."
- Errors in plain English: BM Support not open on the TV, Downloader not installed
  on the TV, devices on different networks.

Access is unchanged: it re-uses the member's own existing 24-hour link, so nothing
new is exposed. Sending over Wi-Fi stays exactly as it is for members who prefer it.

## Technical detail

**Android plugin** (`android/app/src/main/java/uk/bmsupport/app/localsend/`):

- `LocalSendPlugin.openInDownloader({ url })` — builds an explicit intent for
  `com.esaba.downloader` (`MainActivity`, extra `url`), falling back to an
  `ACTION_VIEW` intent scoped to that package. Returns
  `{ launched: false, reason: "not-installed" }` when the package is absent, checked
  via `PackageManager`, so the UI can show the install hint instead of throwing.
- `LocalSendReceiver` gains one authenticated-by-locality command endpoint,
  `POST /api/bm/v1/downloader`, accepting `{ url }`. It only accepts requests from
  the same /24 subnet and only for `https://` URLs on our own host, then calls the
  same intent path and replies with the launch result. This sits beside the existing
  LocalSend endpoints; discovery, transfer and install handling are untouched.

**Web side**:

- `src/lib/localsend.ts` — add `openInDownloader(url)` and
  `startDownloaderOn({ deviceIp, port, protocol, url })` to the plugin interface.
- `src/components/app/AppTransferPanel.tsx` — add the **Open in Downloader** button
  in the download options popup, shown only on native Android (Fire TV / Android TV
  form factors first), using the same short link the QR card already builds.
- `src/components/app/LocalSendDialog.tsx` — add the per-device **Start in
  Downloader** action with its own status line and error messages, reusing the
  current device list and scan.

No changes to talk channels, ticket channels, chat counters, presence, or the
existing LocalSend send/receive flow. A new signed APK build is needed for both the
TV-side button and the phone-to-TV command to work on devices.
