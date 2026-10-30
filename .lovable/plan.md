# BM Direct Install (install-only app on the TV)

## What the customer does
1. On Install Guides, open the new **BM Direct Install** tab.
2. Press **Get my secure download link**. A short link appears that works only for a limited time, to type into Downloader on the Fire TV or Android TV. There is no QR code.
3. Install and open the app on the TV, then sign in with their BM TV Enabler login PIN. This is the same PIN shown on the website.
4. Type in the website code from the self-install steps.
5. The app follows the same installation steps as the phone and Windows apps:
   - It shows progress on screen.
   - It installs only the ticked apps and skips apps already on the TV.
   - It reports what was installed back to the website, which moves to "All done".
   - It ends with "Installation complete" and a red Close button.

There is no screen sharing in this app. A screen-sharing code tells the customer to use the phone or Windows Enabler instead.

## Secure download
- The app file is kept in private storage and is never publicly listed.
- Only a signed-in customer can request a link. Each link is single-customer, expires after 30 minutes, and has a short code that's easy to type into Downloader.
- Expired or unknown links show "Link expired – request a new one on the website".
- Each download is recorded in the admin Download Log.

## How installing works on the TV
Newer Fire TVs block self-debugging, so the app uses Android's normal installer:
- The first time, the customer allows "Install unknown apps" for BM Direct Install.
- After that, they press **Install** once for each app.

The phone and Windows Enablers stay unchanged.

## Technical details
- New in-house Android TV (leanback) project `tv-direct-install/`, signed with the permanent BM key.
- The app reuses the existing endpoints: PIN login, the website-code redeem endpoint, and `enabler-self-install` for progress and the finished report, with the protocol marker. It rejects `support` handoffs.
- Installs use a `PackageInstaller` session (`REQUEST_INSTALL_PACKAGES`), after an installed-package check via `PackageManager` against the cached package names.
- The APK goes in the private `app-builds` bucket.
- New table `direct_install_links`: hashed short code, user_id, expires_at, used_count. RLS is set to owner read only, with grants.
- Authenticated server function `createDirectInstallLink` returns the short code and URL.
- Public route `/api/public/di/$code`: validates the hash and expiry, calls `logDownload`, then streams from storage, or redirects to a 60-second signed URL.
- New "BM Direct Install" tab in the Install Guides device picker.
- AGENTS.md rule: BM Direct Install is install-only, uses PackageInstaller, and is downloaded only through expiring per-customer links.
