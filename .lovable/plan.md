# BM Direct Install: fewer presses on Amazon Fire TV

Fire TV won't let an app switch on Developer options or "Install unknown apps" for itself. So the app guides the customer through it with as few presses as possible.

## What the customer sees (Fire TV)
1. After sign-in, BM Direct Install checks whether it's already allowed to install apps. If it is, it skips straight to the website code.
2. If it isn't, the app shows one screen with a big **Take me there** button and a picture of the remote showing which buttons to press.
3. **Take me there** opens BM Direct Install's own "Install unknown apps" switch directly. The customer presses OK to switch it ON, then Back.
4. If the TV won't open that switch directly (older Fire OS), the app opens Developer options instead. If that's hidden too, it opens **My Fire TV › About**, shows "Press OK on your device name 7 times", and counts down as they go.
5. When they come back, the app re-checks by itself, ticks the step on the website and moves on. They don't need to press Continue.

Android / Google TV keeps the same automatic re-check and the direct-to-setting button.

## Website
- In Step 4 on Install Guides, the Fire TV instructions become shorter: "Press Take me there, press OK, press Back".
- The longer manual path is kept under "Didn't work?".

## Technical details
- `MainActivity.java`: detect Amazon (`Build.MANUFACTURER == "Amazon"`). Try these in order:
  1. `ACTION_MANAGE_UNKNOWN_APP_SOURCES` with `package:` URI.
  2. `ACTION_APPLICATION_DEVELOPMENT_SETTINGS`.
  3. `ACTION_DEVICE_INFO_SETTINGS`.
  4. `ACTION_SETTINGS`.
- Show a remote illustration (OK/Back highlighted) and a hint text for each fallback.
- Re-check `canRequestPackageInstalls()` in `onResume`, and also poll it every 1s while the setting is open. Once it's granted, bring the app back to the front automatically.
- Report `permission` to the progress endpoint as now.
- Bump to 1.2, rebuild, upload to app-builds and add a new app_builds row.
- `DirectInstallSteps.tsx`: shorten the Fire TV copy in step 4 and put the manual path in a collapsible "Didn't work?" section.
