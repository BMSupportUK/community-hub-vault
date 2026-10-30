# BM TV Enabler for the TV itself (install only)

## What the customer does
1. Install the new app straight onto the Fire TV or Android TV, using Downloader or the Install Guides QR.
2. Open it and sign in with their BM TV Enabler login PIN. This is the same PIN shown on the website.
3. Type in the website code from the Install Guides self-install steps.
4. The app follows the same installation steps as the phone and Windows apps:
   - It shows the install screen with progress.
   - It installs only the apps that were ticked, and skips apps already on the TV.
   - It reports what was installed, so the website moves to "All done".
   - It finishes with "Installation complete" and a red Close button.

There is no screen sharing in this app. If a customer enters a screen-sharing code, it says to use the phone or Windows Enabler instead.

## How installing works on the TV
Newer Fire TVs block an app from using debugging on the same TV, so this app installs without debugging. Android's normal installer is used instead:
- The first time, the customer allows "Install unknown apps" for BM.
- After that, they press **Install** once for each app.

The phone and Windows Enablers stay exactly as they are.

## Website changes
- Install Guides gets a third download choice, "Install on the TV itself", with a QR code or short link.
- A new download link for the TV app, recorded in the Download Log.
- The same codes, PINs and "All done" screen. No new code types.

## Technical details
- New in-house Android project `tv-direct-enabler/`, signed with the permanent BM key and set up as a TV (leanback) app.
- Reuses the existing public endpoints: PIN login, the redeem endpoint for website codes, and `enabler-self-install` for progress and the finished report, with the protocol marker header. It rejects `support` handoffs.
- Before downloading, it checks which apps are already installed using `PackageManager` with the cached exact package names. Then it downloads each APK to app cache and installs it with a `PackageInstaller` session (`REQUEST_INSTALL_PACKAGES`).
- New route `/api/public/tv-direct-enabler-apk`, calling `logDownload`. The build is uploaded to app-builds as v1.0.
- AGENTS.md gets a rule: the on-TV Enabler is install-only and uses PackageInstaller, never self-ADB.
