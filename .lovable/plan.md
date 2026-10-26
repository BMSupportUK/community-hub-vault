# BM TV Enabler installs our apps for new customers

## What you'll see (admin)
- In the admin APK section, each app gets an **Install on TV during setup** tick box. Tick the apps a new customer needs, for example the player apps.
- Ticked apps come straight from our own copies, so Downloader and the app stores aren't needed.

## What the customer sees in BM TV Enabler (phone and Windows)
1. **Which TV are you setting up?** Amazon Fire TV or Android / Google TV. This is the same as now.
2. **New step: Do you already have our apps on this TV?**
   - **No, this is a new setup.** The Enabler installs every ticked app.
   - **Yes, I already have them.** No apps are installed, and setup only switches on remote control as it does today.
3. Debugging steps for the chosen TV, then connect, then setup, as now.
4. During setup, if they chose "new setup", the progress text names each app as it goes, for example "Installing Purple Player (2 of 4)…". Apps go straight on with no Install box on the TV. An app already on the TV at the same or a newer version is skipped. If one app fails, the rest still install, and the final screen lists anything that didn't install.
- Their answer is remembered with the TV type and cleared by **Reset setup**. The step has a **Back** button.

## Not included
- No button for staff to send an app during screen share. Apps only go on through BM TV Enabler.

## Technical details
- `app_builds`: new column `install_on_tv boolean not null default false`, toggled in the admin APK section (existing admin/management update policy).
- Public route `/api/public/tv-install-list`: returns ticked, available, current builds only, with package name, version name, file name and a download path. No private data is included.
- Public route `/api/public/tv-install-apk/$id`: streams that APK from private storage only if the build is ticked, available and current.
- Phone `MainActivity.java` and `SetupWizard.java`, and Windows `renderer.js` and `wizard.js` (kept identical): a new "apps" choice shown after the device pick, saved locally and cleared on reset.
- Phone `Enabler.java` and Windows `core.cjs` (kept identical): when "new setup" is chosen, after installing Helper it fetches the list, compares each app with `dumpsys package <pkg>` versionName, and pushes and installs missing or older apps with the existing ADB push and `pm install -r` path. Errors are collected and reported, not fatal.
- Tests: only ticked, available builds are listed; the APK route refuses unticked builds; the Windows wizard skips app installs when "already have them" is chosen.
- Release phone 1.27 and Windows 1.17 as the current downloads, and check both download links.
