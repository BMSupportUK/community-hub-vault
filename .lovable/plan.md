# TV remote control during screen share

## What staff get
On the order's Screen share tab and on the ticket screen share page, a remote control panel sits in the right sidebar under the staff box (who's dealing, End button):
- D-pad (up/down/left/right), OK, Back, Home
- Type text box: staff type, press Send, and the text goes into whatever field is selected on the TV
- Open app: a list of the customer's installed apps that opens the chosen one

Only the staff member dealing with the session can press the buttons. Other staff who are watching see the remote greyed out with "Controlled by <name>", and they can take over.

## Customer side
- The helper app asks the customer to turn on "BM Remote Helper" in Accessibility one time. It shows steps for their TV type and includes "Allow restricted settings" for Google/Android TV.
- If the customer skips that step, screen view still works, and staff see "Remote control is off on this TV" in place of the buttons.
- The customer still has to press Allow on the TV for each session, and End session stops control straight away.

## Fire TV: "Unlock TV remote" button in the BM Support phone app
Fire TV hides the Accessibility switch, so a one-off command has to switch it on. Staff can't send that command from the website, because the TV is only reachable inside the customer's home Wi-Fi. Instead:
- The BM Support Android app on the customer's phone gets an "Unlock TV remote" screen (on the same Wi-Fi as the TV).
- The customer turns on ADB debugging on the TV, types the TV's IP address, and presses Connect. The TV shows a pop-up and they press Allow.
- The app sends the one command, then shows "Remote control unlocked". This is done once per TV.
- When control is off on a Fire TV, the staff panel shows these steps so staff can talk the customer through them.
- iPhone customers would need a PC instead, because iPhones can't send this command.

## Technical details
- Helper APK v1.4: re-add the AccessibilityService (dpad via `performGlobalAction` and focus navigation, `ACTION_SET_TEXT` on the focused node, launch via `PackageManager.getLaunchIntentForPackage`). It reports `controlEnabled` and its app list over the existing session data channel. You need to rebuild and sign it in Android Studio, then upload it to Install Guides.
- BM Support Android app v1.2.7: a Capacitor plugin with an embedded ADB-over-TCP client (port 5555, RSA key pairing). It runs only `settings put secure enabled_accessibility_services <helper>/<service>` and `settings put secure accessibility_enabled 1`, with no free-form shell. It also needs an APK rebuild.
- Commands go over the existing per-session WebRTC data channel from the host staff. Viewer staff send them through the staff-only relay topic, so there's no new public endpoint.
- A `RemotePad` component in `TvRemote.tsx` is shared by the order and ticket pages. Holding control is tracked in session state.
- Tests cover the controller-only rule.
