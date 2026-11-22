# Unlinked devices lock themselves

## What happens now
When you remove a device on the website, the app on that device is already turned away on its next check-in. It forgets the login and goes back to the link-code screen. But the saved favourites, recently watched, watched progress, downloaded channel/film lists and settings stay on the device.

## What will change
When a device is unlinked (by you, by the customer, or after 60 days unused):
1. **Everything is wiped:** saved logins, favourites, recently watched, watch progress, saved channel/film/series lists, guide data, category order, parental PIN, VPN details and reminders.
2. **Playback stops at once** if something is playing.
3. **A locked screen appears:** "This device has been unlinked from BM Support". It has no menus and nothing plays. One **Link this device again** button gives a fresh link code, so the owner can get back in only through their website account.
4. It applies on the next check-in, which is usually within a minute, including while the app is in the background on the box.

Applies to Android/Fire TV box and phone, Windows and Mac.

## Not possible
The app can't delete itself. Devices don't allow that without the owner pressing OK.

## Technical details
- Android: in the MainActivity 401 handler, also stop PlayerActivity/BackupPlayerActivity, clear every SharedPreferences file plus cache and files dirs (keep only the intro film asset), then show a new "unlinked" screen whose button registers a new device token and opens the link screen. Also handle 401 from the announcement/poll Checkin paths.
- Desktop (Windows/Mac): main process on 401 clears the saved store, catalogue/EPG caches and parental/VPN state, stops the engines, and the renderer shows an UnlinkedScreen with the same button.
- Add a small test for each: a 401 wipes the stored items and shows the unlinked state.
- Releases after approval: box 6.45, Windows 0.4.129, Mac 0.1.129. No website change needed.
