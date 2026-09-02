# Wi-Fi Install: push apps straight to a Fire Stick or Android box

Add a "Send over Wi-Fi" option to the BM App Store so a member can install an app
onto their Amazon Fire Stick (or Android TV box) from their phone, with no
Downloader app, no typing URLs, and no long codes — as long as both devices are on
the same Wi-Fi network.

This only works inside our own Android app (a web browser cannot talk to devices on
the local network). In a browser the button explains that and falls back to the
existing 24-hour link + QR flow.

## What the member sees

1. Open BM App Store in the BM Support Android app, pick an app, tap
   **Send over Wi-Fi**.
2. First time only: a short guide with pictures/steps to turn on ADB debugging on
   the Fire Stick (Settings > My Fire TV > Developer Options > ADB debugging ON).
3. The app scans the local Wi-Fi network and lists the TV devices it finds, showing
   name/model and IP address.
4. Tap the device. The Fire Stick shows a one-time "Allow USB debugging?" prompt —
   the guide tells them to tick "Always allow" and press OK.
5. The phone downloads the APK (using the same secure, expiring transfer link the
   member is already entitled to), then installs it onto the TV with a live progress
   bar: Connecting > Authorising > Transferring 43% > Installing > Done.
6. On success: "Installed on Fire TV Stick 4K — open it from your TV's apps row."
   Clear, plain-English errors for the common failures (debugging off, prompt not
   accepted, device went to sleep, storage full, not on same network).

Access is the same as today's download links: subscriber, staff, admin, management.
Nothing new is exposed to other members.

## Phasing

- Phase 1 — the feature end to end: native Wi-Fi install plugin, device discovery,
  UI, progress, error handling, setup guide, and a new signed APK build so members
  actually get it.
- Phase 2 (after you've tested) — remember paired devices per member so repeat
  installs are one tap, plus a staff-side log of Wi-Fi installs alongside the
  existing download tracking.

## Technical detail

**Native side (new custom Capacitor plugin, `WifiInstall`)**

- New Java plugin in `android/app/src/main/java/uk/bmsupport/app/wifiinstall/`
  registered from `MainActivity.java`, exposing:
  - `scan()` — sweeps the phone's /24 subnet for open TCP port 5555 (ADB) in a
    bounded thread pool with a short timeout; for each hit, opens an ADB connection
    and reads `getprop ro.product.model` / `ro.product.name` for a friendly label.
    Emits `wifiInstallDevice` events as devices are found so the list fills live.
  - `install({ host, port, url, headers })` — connects, authenticates, streams the
    APK over the ADB `exec:pm install -r -S <size>` path, emits
    `wifiInstallProgress` events, resolves with the install result text.
  - `cancel()`.
- ADB client: bundle the pure-Java `AdbLib` protocol implementation (no adb binary,
  no root). RSA keypair generated once and persisted in app-private storage so the
  TV's "Always allow" grant keeps working on later installs.
- Manifest additions: `ACCESS_WIFI_STATE`, `ACCESS_NETWORK_STATE`, and
  `android:usesCleartextTraffic` scoped to nothing new (ADB is a raw socket, not
  HTTP, so no cleartext HTTP exception needed).
- APK bytes are fetched by the plugin from the member's existing
  `/api/public/a/:token` URL, so entitlement and expiry stay server-enforced and
  unchanged.

**Web side**

- `src/lib/wifi-install.ts` — thin typed wrapper around the plugin using
  `registerPlugin`, plus a `isWifiInstallAvailable()` check
  (`Capacitor.isNativePlatform()` and plugin presence). Browser-only APIs stay
  inside handlers/effects.
- `src/components/app/WifiInstallDialog.tsx` — device scan list, setup guide
  accordion, progress states, error copy, retry.
- `src/components/app/AppTransferPanel.tsx` — add a **Send over Wi-Fi** button to
  each app card next to the existing link flow. In a browser it shows a short
  "available in our Android app" note with the QR fallback. Existing card layout,
  countdown and popup behaviour stay as they are.
- To get the APK URL the dialog reuses the current `requestAppTransfer` server
  function; no new server functions, no schema change in Phase 1.

**Build/release**

- `npx cap sync android` plus the existing `.github/workflows/android-build.yml`
  produces the new APK; the in-app update announcement already wired to
  `announce_updates` tells members a new version is available.

## Constraints and honest limits

- The Fire Stick owner must turn on ADB debugging once and accept the on-TV prompt.
  There is no way around this — it is Android's security model.
- Some carrier/guest Wi-Fi networks isolate clients, which blocks discovery. The
  dialog detects the no-devices-found case and explains it.
- Talk channel, ticket channel, and chat counter code is not touched.
