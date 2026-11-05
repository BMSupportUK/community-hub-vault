# Sync film and series progress across devices

## What changes for customers
- If you stop a film or episode on one BM Player (Android TV, Fire TV, phone, Windows or Mac), every other device on the same account and login shows the same watched bar and offers **Continue watching** from that point.
- Series posters still take you back to the last episode watched, so you can carry on from there.
- Live TV and catch up are not synced, as now.
- If you've watched the same film on two devices, the device used most recently wins.

## How it works
- Every device keeps its watch progress on the device, as now. On top of that, it sends each update to the website: when you stop or exit, and about every 30 seconds while playing.
- Devices fetch the account's progress when the app opens after the account number is entered, and again when Films, Series or an item's menu opens. The fetched progress is merged into the device's own: for each title the newest position is kept.
- A device that has never synced uploads its existing progress first, so nothing already watched is lost.
- Progress is stored per account owner and per provider login (the same grouping favourites use). Only that owner's linked devices can read or change it.

## Technical details
- New table `player_watch_progress` (owner_key, scope_key, item_key, position_ms, duration_ms, updated_at; primary key on owner_key + scope_key + item_key). It is only reachable through the player API: service role gets access, there are no client policies, and RLS is on.
- `src/routes/api/public/player.ts`: new device-token actions:
  - `progress` returns all rows for the owner and login.
  - `progress_set` takes a batch of up to 50 items and saves each one only if it is newer than the stored copy. It is rate-limited, and items whose kind isn't film/episode/series are refused.
  - Both reuse the owner and scope resolution that favourites use.
- Android: the WatchProgress write path also adds the item to a background push queue, and pulled progress is merged into the existing prefs keys.
  - Covers both the built-in player and the backup player.
  - Release as Android 3.33.
- Windows/Mac: `main.cjs` pushes from where progress is saved and pulls after unlock and when catalogues load. This goes through the same unlock-gated bridge. Release as Windows 0.4.10 and Mac 0.1.24.
- Tests:
  - Website: newest position wins, and a different owner can't read the rows.
  - Android: unit test for merging local and pulled progress.
  - Desktop: bun test for the same merge.
- Update the AGENTS rule that says watched positions stay on the device.
