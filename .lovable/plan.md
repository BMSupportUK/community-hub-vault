# BM TV Enabler for the TV itself (Fire TV / Android TV app)

## What the customer does
1. Install the new app straight onto the TV, using Downloader or the Install Guides QR.
2. Open it and sign in with their BM TV Enabler login PIN. This is the same PIN shown on the website.
3. Type in the website code from Install Guides, a ticket or an order.
4. The app reads what the code is for:
   - **Install apps**: shows the same install screen with progress and installs only the apps they ticked. Apps already on the TV are skipped. When it's done it reports back, so the website moves to "All done". A red Close button finishes it.
   - **Screen sharing**: starts BM Remote Helper and links the TV to the ticket or order, so staff can connect.

## Important limit (no debugging needed on the TV)
Newer Fire TVs block an app from switching debugging on and using it on the same TV. So this app will not use debugging at all. Instead:
- Each app install uses Android's normal installer. The customer presses **Install** once for each app, and allows "Install unknown apps" for BM the first time.
- Screen sharing needs BM Remote Helper's existing permissions: screen capture is approved on screen. Remote control still needs the phone or Windows Enabler once, because only those can switch the control permission on.

The phone and Windows Enablers stay as they are. The TV app is an extra option.

## Website changes
- Install Guides gets a third download choice, "Install on the TV itself", with a Downloader code or short link and a QR code.
- A new download link for the TV app, recorded in the Download Log.
- The same codes, PINs, ticket/order linking and "All done" screen. No new code types.

## Technical details
- New in-house Android project `tv-direct-enabler/`, signed with the permanent BM key and set up as a TV (leanback) app.
- Reuses the existing public endpoints: PIN login, `enabler-handoff` redeem, `enabler-self-install` (progress/finished report), `enabler-ticket-support`, plus the protocol marker header.
- Installs: downloads the APK to app cache, then a `PackageInstaller` session with `REQUEST_INSTALL_PACKAGES`. Before downloading, it checks which apps are already installed using `PackageManager` with the cached exact package names.
- Support: installs or updates BM Remote Helper the same way, then launches it with the handoff reference.
- New route `/api/public/tv-direct-enabler-apk`, calling `logDownload`. The build is uploaded to app-builds as v1.0.
- AGENTS.md rule added for the TV app's no-ADB install path.
