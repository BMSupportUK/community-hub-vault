# TV install progress screen (Amazon Fire TV and Android TV) — install only

## What the customer will see on the TV
1. **Installing screen**: BM Support logo, "Installing your apps, please don't turn off your TV", the name of the app being installed, "App 2 of 4" and a progress bar.
2. **Skipped apps**: apps already on the TV show as "Already installed".
3. **Complete screen**: a green tick, "Installation complete" and the list of apps. Press OK to close, or it closes by itself after 30 seconds.
4. **Problem screen**: if an install fails, the TV says "Something went wrong, please follow the steps on your phone or PC", and the Enabler shows the same message.

This only happens when the customer chooses "Install our apps". Screen-share support and BM Remote Helper don't change.

## How it works
- A new small app called "BM Install Screen" is installed on the TV first. Its only job is showing these screens, and it has no permissions. If it's already on the TV, this step is skipped.
- The Enabler (phone and Windows) opens it, then updates it as each app installs, and finally shows Complete.
- A separate app is the right choice. BM Remote Helper only handles the screen-share code, and putting the install screen in a separate app keeps the two apart. Without an app on the TV, there would be nothing to show the screens.

## Technical details
- New Android project `tv-install-screen/` (package `uk.bmsupport.installscreen`, Leanback launcher hidden). It has one activity that receives updates with `singleTop` and `onNewIntent`. Its states are installing, skipped, complete and error, sent as intent extras (`state`, `app`, `index`, `total`). It keeps the screen on and closes itself 30 seconds after Complete. It's signed with the permanent BM key and is kept very small.
- It's served from a new `/api/public/install-screen-apk` (latest available `app_builds` row named "BM Install Screen"), and downloads are logged with `logDownload`.
- The install-only loops in both `tv-enabler` and `windows-tv-enabler` work the same way. They install the screen app first, skipping it if its exact package is already there, then run `am start` updates before and after each app, and finish with Complete or Error. The screen app is not included in the customer-facing app list.
- New Phone and Windows releases. The install-only guides, PDFs and narration will be updated to mention the TV screen.
- Tests: unit tests for the intent extras of each state, and a check that skipped apps send "skipped".

## Not verifiable here
I can't test this on a real Fire TV or Android TV from here, including whether Fire OS lets the screen show while apps are installing.
