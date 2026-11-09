# Hide the server address when a channel won't play

## What changes
When a channel, film or episode fails to play, every BM Player (Android box, Android phone, Windows, Mac) shows one plain message:

"This channel isn't working right now. Try again, pick another channel, or use Report a problem."

The message never shows the server address, port, login or file location. Staff still see the full technical details in the automatic playback report, which stays admin-only on the website.

## Steps
1. Find the exact "can't play this file" message on each app by making a channel fail on purpose. The wording isn't in BM Player's own text, so it most likely comes from the built-in video engine's own pop-up or a raw error passed straight to the screen.
2. Turn off the video engine's own error pop-ups (main and backup engines) so it can never print the address.
3. Send every playback error shown on screen through one cleaner that removes web addresses, IP addresses and logins, falling back to the plain message above.
4. Keep the full error only in the staff playback report.
5. Add tests that check addresses and logins are removed from the message.
6. Release Android 4.10, Windows 0.4.51 and Mac 0.1.61 so they update in place.

## Technical details
- Android: PlayerActivity / BackupPlayerActivity / MainActivity failure labels and toasts go through a `SafeError.forScreen()` helper; libVLC gets `--no-interact` / `--quiet` and no dialog callbacks. lastError stays in the automatic report only.
- Windows/Mac: main.cjs `play` rejections and engine state-7 errors map to the generic message before `send({type:'notice'})`; renderer `toast(error.message)` also passes through the cleaner. Engine stderr is never forwarded.
- Cleaner strips `scheme://...`, `host:port`, IPv4/IPv6, and `/live/<user>/<pass>/` paths; unit tests in the Android test folder and the desktop test suite.
