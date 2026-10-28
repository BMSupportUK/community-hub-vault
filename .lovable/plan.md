# TV install progress screen (Amazon Fire TV and Android TV)

## Answer
Yes, this is possible. The BM TV Enabler (phone and Windows) can show a full-screen BM Support message on the TV while it installs apps, then show a "Complete" screen at the end.

## What the customer will see on the TV
1. **Installing screen**: BM Support logo, "Installing your apps, please don't turn off your TV", the name of the app being installed, and "App 2 of 4" with a progress bar.
2. **Skipped apps**: apps that are already installed show as "Already installed".
3. **Complete screen**: a green tick, "Installation complete", the list of installed apps, and "Press OK to close". It closes by itself after 30 seconds.
4. **Problem screen**: if an install fails, the TV shows "Something went wrong, please follow the steps on your phone or PC", and the Enabler shows the same message.

The phone and Windows Enabler screens stay the same. The TV screen is extra.

## How it works
- The TV needs a small app before it can show any screen. The Enabler installs a tiny "BM Installer Screen" first (or uses the BM Remote Helper's screen if it is already on the TV). Then it opens that screen and sends it progress updates while each app installs.
- When everything is done, the Enabler sends the "Complete" message and the TV screen changes to the tick.
- This works for both install-only and screen-share setup, on Amazon and Android/Google TV.

## Technical details
- Add a lightweight display activity to the BM Remote Helper (already signed with the BM key). Install it first, then start it with `adb shell am start -n <helper>/.InstallProgressActivity --es state installing --es app "<name>" --ei index N --ei total M`. Send each update as a new intent (`singleTop`, `onNewIntent`). States: installing, skipped, complete, error.
- Use `setShowWhenLocked` and keep the screen on. Pressing Back or OK closes the screen. It closes itself 30 seconds after the "complete" state.
- The phone (`tv-enabler`) and Windows (`windows-tv-enabler`) install loops send the same intents, so the shared install steps stay identical.
- Release new Helper, Phone and Windows versions using the permanent signing key, and update the written guides, PDFs and narration where they describe the install step.
- Tests: an intent-builder unit test for each state, plus a check that already-installed apps send "skipped".

## Not verifiable here
I can't test this on a real Fire TV or Android TV from here. That includes whether Fire OS lets an app open on top of the screen while it is being installed.
