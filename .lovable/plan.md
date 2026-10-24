# BM TV Enabler: small customer phone app for Fire TV remote control

## Goal
A small, separate Android phone app ("BM TV Enabler") that a customer downloads without needing the full BM Support app or an account. It switches on BM Remote Control on their Amazon Fire TV, so staff can then control the TV during a screen share.

## What the customer does
1. Open the download page on their Android phone (bmsupport.uk/tv-enabler) and install the app.
2. On the Fire TV, open BM Remote Helper. It shows the TV's address (for example 192.168.1.23).
3. In the phone app, type that address and press **Turn on remote control**. Phone and TV must be on the same Wi-Fi.
4. On the TV, tick "Always allow" and press **Allow**.
5. The phone shows step-by-step progress, then "Remote control is on". After that the phone app is no longer needed.

## Screens
- One screen: the BM logo, a box for the TV address, a Turn on button, a live step list (Connecting, Allow on TV, Installing, Switching on, Done), plain-English fixes when something goes wrong (wrong Wi-Fi, Allow not pressed, TV debugging switched off), and a Try again button.
- An optional "Find my TV" button that scans the home Wi-Fi for Fire TVs, so typing the address is optional.

## Where it appears
- A new public download page with simple instructions and a QR code.
- The Fire TV helper's instructions will say "Install BM TV Enabler on your phone" next to the QR code. They will no longer send customers to the full BM Support app.
- The current BM Support app's Settings › TV remote option stays as it is for staff and existing users.

## Limits
- Android phones only. iPhones cannot do this, so iPhone customers need someone else's Android phone. The Windows/Mac option is still on hold until you ask for it.
- The first time it runs, the customer has to press Allow on the TV.
- Fire TV's Developer options / ADB debugging must be on. The helper already walks customers through that.

## Technical details
- New standalone native Android project (no web view, no login), package `uk.bmsupport.tvenabler`, signed with the existing permanent key and its own version numbers.
- Reuses the Wi-Fi ADB client and the install steps from `TvRemoteSetupPlugin.java`: copy control.apk to /data/local/tmp, `pm install`, then enable the accessibility service. The code is moved into a shared module so both apps use the same steps.
- Optional subnet scan of port 5555 for discovery.
- The APK is served through a new public download route, `/api/public/tv-enabler-apk`, taking the latest app_builds row named "TV Enabler". It follows the same pattern as remote-helper-apk.
- New public page `src/routes/tv-enabler.tsx` with its own head() metadata.
- Update the helper's on-TV instructions/QR to point to the new page. A new helper build is needed for this.
- Record the rule in AGENTS.md. Build the APK in the sandbox and upload it. The build can be checked here, but a real Fire TV test is still needed on your side.
