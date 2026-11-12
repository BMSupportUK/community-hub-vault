# Make the BM apps harder to copy if they get into the wrong hands

## Where things stand now
- **No secret keys are inside any app** (BM Player, TV Enabler, Remote Helper, Remote Control, Windows, Mac). Payment, voice and admin keys stay on the website. Someone who takes an app apart can't get into the backend or customer data with what they find.
- **Every app has to get past the website first.** It only works after a device code is linked, VPN checks pass and the website accepts it, and each device has its own code that can be cancelled. Copying the app doesn't get anyone past those checks.
- **Android apps are signed with the permanent BM key.** Nobody else can release an update that installs over yours.
- **The weak spot:** the app code isn't scrambled. With free tools, someone could read how the apps work (screens, website addresses, how they talk to the website) and could copy the look or the way they work.

## Plan
1. Turn on code scrambling and shrinking for the four Android apps (BM Player, TV Enabler, Remote Helper, Remote Control). Keep the parts they need to talk to each other and to the website working.
2. Scramble the code in the Windows and Mac players before packaging them.
3. Check each app doesn't run on a tampered copy: Android checks it's still signed with the BM key and refuses to start if not; the website already refuses unlinked devices.
4. Run all the Android and Windows/Mac checks, then build and release new versions of every app and confirm the downloads match.

## Technical details
- Gradle `minifyEnabled true` + `shrinkResources true` with keep rules for Capacitor/plugins, ExoPlayer/libVLC, the JSON models and anything called by reflection or JNI. Upload the mapping files to private storage so crash traces can still be read.
- Electron: run `javascript-obfuscator` over `main.cjs` and the renderer bundle during the release step (the source in the repo stays readable).
- Android signature self-check against the permanent cert's SHA-256 at startup.
- Risk: scrambling can break code that's looked up by name. That's why the full test runs happen before release.
