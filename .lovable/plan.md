# Streaming server address (DNS) protection in BM Player

## What is already protected
- The server address is not built into any app download. Someone who only has the app file finds nothing in it.
- The address is sent by the website only to a linked device, after the device-code sign-in. If the device is unlinked, the website refuses it (401) and the app wipes its saved login.
- Windows and Mac keep the address, username and password in an encrypted file that only that computer's user account can open.
- On the Mac, the picture screen only sees a stand-in `bmstream://` address. It never sees the real server.
- Our own app code is scrambled, and box backups are switched off, so the saved data can't be copied off with a backup.

## Gaps found
1. **Box / phone:** the password is locked with the device's secure key, but the server address and username are saved as plain text in the app's own storage. Someone with a rooted box could read them.
2. **All devices:** provider streams use plain http. Anyone watching the home network traffic, such as on shared Wi-Fi, can see the server address. Only the provider can fix that by offering https.
3. **Optional outside players:** if a customer switches on an outside video player in Settings, that player is handed the full stream address.

## Proposed changes
- Lock the server address and username on the box with the same secure device key already used for the password. Move existing saved values over quietly on first start, so nobody has to link again.
- Mark streams opened in an outside player in the play menu, with a short warning when it's switched on in Settings. Outside players stay optional, as agreed before.
- Release as box 5.77. Windows and Mac don't need a change.

## Technical details
- Add `SecureLogin.dns(prefs)` / `user(prefs)` that seal the values with the Keystore AES key. Replace the `prefs.getString("dns"/"user")` reads in MainActivity, CategoryOrder and ProgressSync. Keep the existing scope strings the same after decryption, so saved watch progress and category order still match.
- Migration: on start, if plain `dns`/`user` exist, seal them and remove the plain keys.
- Add a test beside the existing SecureLogin tests for sealing, reading back and migrating.
