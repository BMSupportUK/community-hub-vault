# 2FA resets at midnight + new BM Player logo

## Cache on close
Nothing changes. Clearing everything would make every open slower, because channels, films and the guide would have to download again each time.

## 1. Daily 2FA code resets at 00:00 UK time
- Today, a box asks again 24 hours after the last code was entered. It will change so the code is asked for again once the UK clock passes midnight.
- Once a customer enters a code, they won't be asked again until after midnight, even if they close and reopen the app.
- This is decided by the website, so it works on Android, Amazon, Windows and Mac without new app versions.
- Clock changes (summer and winter time) are handled.

## 2. Retro TV with play button logo in every player
- It replaces the current logo in these places:
  - Android and Amazon: the app icon on the home screen, the TV-box banner, and the logo on the sign-in and 2FA screens and in headers.
  - Windows: the desktop and Start menu icon, the installer icon, and the logo inside the app.
  - Mac: the app icon and the logo inside the app.
- Release new versions: Android/Amazon 4.22, Windows 0.4.59, Mac 0.1.68.

## Technical details
- `src/lib/player-totp.ts`: change `totpStillValid` to compare the Europe/London calendar day of `totp_passed_at` against now (using Intl), instead of the 24h window. Add a `bun test` for: a code entered at 23:59 is no longer valid at 00:01; one entered at 00:01 is still valid at 23:59; and a BST case.
- Logo source: `/mnt/documents/bm-player-digital-tv-logo-2.png`.
  - Android: generate mipmap launcher PNGs (mdpi to xxxhdpi), a 320x180 TV banner, and replace `drawable-nodpi/bm_logo.png`. Desktop builds already copy `bm_logo.png` as `logo.png`.
  - Windows: rebuild `build.ico` (multi-size) for the exe and NSIS installer.
  - Mac: generate `.icns` for the bundle icon.
- Rebuild and release the apps the same way as the last release: Android Gradle build then upload; Windows unpack, overlay files and run makensis; Mac swap the asar, add icns, update Info.plist and the integrity hash, then rcodesign. After each upload, register the new build as current.
- Update the "once a day" wording in AGENTS.md to "resets at UK midnight".
