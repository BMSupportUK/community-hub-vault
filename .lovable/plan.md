# Remote control for Google TV and Android TV (Fire TV stays screen view only)

## Why the switch wouldn't stay on (likely causes, not yet confirmed on a real TV)
1. **Android's "restricted settings" block.** On Android 13+, apps installed from a downloaded file (for example through Downloader) can't turn on Accessibility, and on TVs the switch just flips back off. Apps installed through a proper installer, such as the BM Support app's installer, are not blocked.
2. **A setup mistake in the helper.** It asks to read remote button presses without declaring that it's allowed to. Some TVs then turn the switch off straight away. If the helper crashes on start-up, it also turns off.

## What changes
- **Helper app v1.4**
  - Fix the remote-control setup so the switch can stay on.
  - Guard the start-up code so it can't crash the switch off.
  - Send button presses (D-pad, OK, Back, Home), typed text into the selected box, and an app list with an "open app" action.
  - Tell staff whether remote control is on or off.
- **Install route (no BM Support app needed).** Split the helper into two apps:
  - **BM Remote Helper** (screen share), installed with Downloader as it is now.
  - **BM Remote Control** (the Accessibility part), bundled inside the helper. On first open the helper shows "Install remote control". The customer allows "install unknown apps" for the helper, then presses Install. The helper installs the second part with Android's trusted installer, so its Accessibility switch isn't blocked. The helper then opens the Accessibility screen at the right switch.
  - Backup if the switch is still greyed out: the helper shows the steps Settings, Apps, BM Remote Control, then the 3-dot menu and "Allow restricted settings".
- **Staff remote panel.** On the order's Screen share tab and the ticket screen share page, a sidebar remote has a D-pad, OK/Back/Home, a Type text box and an Open app list. Only the staff member dealing with the session can press buttons. Other staff see "Controlled by <name>" and can take over.
- **Fire TV.** The panel shows "Remote control isn't available on Fire TV — screen view only."

## What you'll need to do
Rebuild and sign in Android Studio with the same key. The project will build both apps, with Remote Control packed inside the helper. Upload only the helper to Install Guides as "BM Remote Helper". Test on one Google TV before telling customers about it.

## Technical details (install split)
- New Gradle module `control` (package `uk.bmsupport.remote.control`) holds the AccessibilityService. The helper's build copies the signed `control` APK into its `assets/`.
- The helper adds `REQUEST_INSTALL_PACKAGES` and installs the APK through `PackageInstaller.createSession` (session-based installs are exempt from Android 13+ restricted settings). It handles `STATUS_PENDING_USER_ACTION`.
- Helper and Control talk through a signature-protected bound service and permission, so other apps can't send commands.

## Technical details
- `accessibility_config.xml`: add `android:canRequestFilterKeyEvents="true"`, `canPerformGestures`, `notificationTimeout`, and `settingsActivity`. Wrap `onServiceConnected` and `onAccessibilityEvent` in try/catch.
- Commands: `performGlobalAction` (BACK/HOME), focus traversal via `focusSearch` with `ACTION_FOCUS`/`ACTION_CLICK` for the D-pad and OK, `ACTION_SET_TEXT` on the input focus, and `getLaunchIntentForPackage` for Open app.
- Transport: the existing per-session WebRTC data channel from the host. Viewers send commands through the staff-only relay topic, and the host forwards only the controller's commands.
- `RemotePad` in `TvRemote.tsx`, shared by order and ticket pages. Controller id is held in session state, with a test for the controller-only rule.
- Video code stays untouched apart from adding the remote panel to the screen share pages, which you asked for.
