# BM Player box and phone: close the app properly

## The problem
- **Exit BM Player** on the home screen only closes the home screen. The app carries on running in the background and stays in the phone's recent apps list.
- **Still watching?** has a different way of closing the app, which is meant to shut it down completely after the 60-second countdown. You've seen it leave the app running on Amazon and Android boxes. I haven't been able to confirm why from the code alone, so the first step is to reproduce it.

## What I'll change
1. **One proper close for everything.** Exit BM Player, the Close app button on Still watching?, and the countdown running out will all close the app the same way:
   - stop any video or sound that's playing,
   - close every BM Player screen, including the player and Multi-screen,
   - remove BM Player from the recent apps list,
   - go back to the device's home screen,
   - fully stop the app so nothing is left running.
2. **Make the countdown close reliably.** The 60-second close will happen whatever screen is showing, even if the warning box has been hidden or the video screen has frozen. A backup stop a moment later shuts the app down if the normal close gets stuck.
3. **Find the real cause on Amazon and Android boxes.** I'll recreate the countdown in the app's automatic tests to see what stops the close, then fix that too.
4. Parental control still re-hides adult categories next time, as now, because the app starts fresh.
5. Release a new box app (5.83), which covers boxes and phones, and check that the download on the website matches the new version.

## Not changing
- Still watching? still shows after 3 hours with no button presses and gives 60 seconds to answer.
- Pressing Home or switching apps without choosing Exit still leaves BM Player where you were, as now.
- Windows and Mac aren't affected.

## Technical details
- Add `PlayerApplication.closeApp(reason)`, reusing the existing `exitToHome()` sequence. Watchdog arm first, then `finishAndRemoveTask()` on every tracked activity, then a HOME intent, then `killProcess` after 1.5s. MainActivity's "Exit" button calls it instead of `finish()`.
- Release native players (`stopPreview`/`stopMulti` and libVLC in the player screens) before finishing, so cleanup can't block the main thread.
- Robolectric tests:
  - "Exit" finishes all activities and requests the process stop.
  - An expired prompt with a destroyed owner activity, or a null foreground, still triggers exit.
  - Continue viewing cancels the close.
- Build, sign with the BM key, upload, register the 5.83 app_builds row, demote 5.82, and check the live SHA-256.
