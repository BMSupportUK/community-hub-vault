# Fix: BM Direct Install drops back to the PIN after allowing unknown apps

## What we know
- Your PIN from today is still valid and has not been revoked. It signed in at 22:45, and no wrong-PIN attempts were recorded, so the server didn't lock it.
- When you switch "Install unknown apps" on, Android usually closes and restarts the app that got the permission. When BM Direct Install restarts, it forgets it was waiting on that step. It also only reads the saved sign-in from the TV's storage, and that storage is written in the background, so it may not be saved in time.
- When the app thinks you're signed out and you type the PIN again, a later failure (for example "Please sign in again") wipes the saved sign-in. Then it keeps sending you back to the PIN. To you that looks like the PIN is locked out.
- The exact cause hasn't been confirmed on a real TV yet. The first step below is a check that will confirm it.

## Changes (BM Direct Install 1.3)
1. **Remember the sign-in properly.** Save the PIN sign-in to the TV's storage straight away instead of in the background. Also save "waiting for the unknown-apps permission", so a restart picks up where it left off.
2. **On restart, check with the website instead of guessing.** If a sign-in is saved, the app asks bmsupport.uk whether it's still good. Then it goes straight to the next step: the website code, or the installs if a code was already entered. Only a clear "no" from the website sends you back to the PIN. Internet problems never wipe the sign-in.
3. **Never wipe the sign-in from a progress report.** Step reports stay silent. Only the website-code check can ask you to sign in again, and only when the website says the sign-in has ended.
4. **Clear "PIN locked" message.** If you ever get "Too many wrong PINs", the app says how long to wait instead of looking stuck.
5. **Debug trail.** The app records "restarted after permission" and "sign-in kept or lost" in the existing TV diagnostics, so the next test proves what happened.
6. Rebuild and sign with the permanent BM key. Upload it as the current BM Direct Install build. New secure download links then give out 1.3.

## To test
Get a new download link and install 1.3 over the old one. Sign in with your PIN and allow unknown apps. The app should come back on the "Enter your website code" screen without asking for the PIN again.

## Technical
- `MainActivity.java`: `commit()` for the token and the `waiting_permission`/pending paths prefs. In onCreate, restore the pending state and validate the token via `enabler-login {token}`. Clear the token only on a 401 from `enabler-handoff` or the token check. Add an `onSaveInstanceState` fallback. Bump versionCode/versionName and the `app` tag to `direct-1.3`.
- No website or database changes are needed, apart from the new `app_builds` row.
