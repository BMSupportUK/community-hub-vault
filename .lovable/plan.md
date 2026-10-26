# TV shows a code, customer types it into BM TV Enabler

## Is it better?
Yes, it closes one gap. Today, pressing "Allow" on the TV proves the phone or PC may connect, but not that the customer picked their own TV. In a home with several TVs, or on a shared Wi-Fi, the app could set up the wrong one. A code shown on the TV screen proves the customer is looking at the TV the app is connected to.

The "Allow" box itself has to stay. It's built into the TV and can't be skipped.

## New wizard order (phone and Windows, Amazon and Android)
1. Turn on debugging on the TV and confirm in the app (unchanged).
2. Connect, then press Allow on the TV (unchanged).
3. **New: "Type the code on your TV."** The app puts a 4-digit code on the TV screen and the customer types it into the app.
   - If the code is wrong, the app shows "That's not the code on this TV". After 3 wrong tries it disconnects and goes back to step 2, so they can pick a different TV.
   - A **Show code again** button puts the code back on screen.
4. When the code matches, the app does everything else without stopping to ask: check what's already on the TV, install BM Remote Helper, install remote control, turn it on, and check again. A progress line shows what's happening. The step-by-step "Done — next step" confirmations go away, because the code has already proven it's the right TV.
5. Finish: TV setup confirmed, the confirmation code for the website, and the "Open BM Remote Helper" button (unchanged).

If the TV is already set up, it still needs the code. After that it goes straight to Finish.

Reset setup stays.

## How the code gets onto the TV
- First choice: an on-screen notification on the TV, sent over the connection the app already has.
- Fallback for TVs that hide those notifications: the code shows as a full-screen message on the TV. If BM Remote Helper is already installed, it shows the code; otherwise the TV's own built-in message screen is used.
- The code is made fresh on each connection, never leaves the phone or PC, and only works for that connection.

## Technical details
- `SetupWizard.java` and `windows-tv-enabler/renderer/wizard.js` (kept identical): add a TV_CODE state after connecting, and make HELPER, CONTROL, ACTIVATE and REPORT run one after another automatically. Update both test suites: a wrong code doesn't move on, 3 wrong codes reset to connect, and a correct code runs through to DONE.
- `Enabler.java` and `core.cjs`: add `showTvCode(host, code)`. It tries `cmd notification post` first, then the fallbacks.
- The Amazon and Android install steps themselves stay the same.
- Release phone 1.16 and Windows 1.5. Use the same signing key and download links, and update the step text on the website.
- Risk: some Fire OS versions may block notifications sent over ADB. The full-screen fallback covers that, but it needs testing on your real Fire TV and Android TV.
