# TV shows a pairing code at step 2, customer types it into BM TV Enabler to connect

## What's possible
- **Android / Google TV (Android 11 and newer, "Wireless debugging"):** Yes. The TV has a built-in "Pair device with pairing code" screen. It shows a 6-digit code and a port number. The customer types both into BM TV Enabler, and the app connects. No Allow box is needed, and the code already proves it's the right TV.
- **Amazon Fire TV, and older Android TVs with only "Network debugging":** No. Before the app connects, nothing on the TV can show a code. BM Remote Helper isn't installed yet, and Fire OS has no pairing-code screen. These TVs keep today's flow: press Allow, then type the 4-digit code that appears on the TV.

## New step 2 for Android / Google TV
1. On the TV: Settings › System › Developer options › Wireless debugging › **Pair device with pairing code**.
2. In the app, choose **Pair with code** and type the 6-digit code and the pairing port shown on the TV. The TV's address is filled in from Find my TV or typed in.
3. The app pairs, then connects. It skips the separate 4-digit code step and runs setup automatically, as it does now.
4. If the code is wrong or has expired, the app says "Code didn't work — open the pairing screen again for a new code."

Amazon steps stay exactly as they are.

## Technical details
- Add ADB wireless pairing to the phone `AdbClient` (kept identical in `tv-enabler` and the BM Support `tvremote`) and to Windows `core.cjs`: TLS 1.3 plus the SPAKE2 pairing exchange, then send the app's existing RSA key. After that, connect over TLS to the wireless-debugging port, which the TV advertises via mDNS `_adb-tls-connect._tcp` (or the customer types it in).
- `SetupWizard` (phone and Windows kept identical): when pairing succeeds, the step goes from CHECK straight to SETUP. Add tests for both suites.
- Update the step text in both apps and on the website instructions.
- Release phone 1.19 and Windows 1.8 with the same signing key and download links.
- Risk: pairing is a large protocol piece, and it can only be fully proven on a real Android/Google TV.
