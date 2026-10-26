# Send one of our apps to the customer's TV

## What staff will see
- A new **Send an app** button in the Remote control section of the screen-share panel. It works the same on **tickets** (ticket Screen share tab) and **orders** (secure checkout Screen share tab), and the link is tied to that ticket or order.
- Pressing it opens a pop-up that lists our current apps from the downloads list, with the name and version of each (for example BM Remote Helper and the player apps).
- Staff pick an app and press **Send to TV**. The site then:
  1. Makes a short link for that app that works for **24 hours**, such as `bmsupport.uk/a/7K2QXP`, tied to this ticket or order.
  2. Opens the Downloader app on the TV and types the link in by itself.
  3. The download starts. Staff then press **Install** on the TV's own install box using the on-screen remote.
- The pop-up shows the link and when it runs out, plus a **Type it again** button in case the TV missed it.
- **Apps installed by BM TV Enabler.** In the admin APK section, each app gets an **Install on TV during setup** tick box. During setup, BM TV Enabler (phone and Windows) installs every ticked app the TV doesn't have yet, and updates any that are older, the same way it already installs BM Remote Helper. No Install box appears and staff don't have to do anything.
- **Downloader** is uploaded to the APK section and ticked, so it always goes on during setup.
- The Enabler's progress text names each app as it goes, for example "Installing Downloader (2 of 3)…". If one app fails, setup carries on and the rest still install.
- If a TV was set up with an older Enabler and still has no Downloader, the pop-up says so and offers to open Downloader's app store page on the TV as a backup.
- Each sent link is added as a staff-only note on the ticket or order, saying which app, who sent it and when.

## Why it works this way
The TV can't take a file pushed straight to it during screen share, because BM Remote Helper on the TV doesn't support that. Opening Downloader and typing the link only uses the remote buttons and typing it can already do, so no TV app has to be updated. The TV will always show its own Install box, and staff press it with the remote.

## Rules
- Only staff in a live screen share who are currently controlling the TV can send an app.
- A link only downloads the one app it was made for, stops working after 24 hours, and can't be used to see any other files.
- The list only includes apps that are marked as available in the downloads list.

## Technical details
- New table `tv_app_links`: short code (hashed), app_builds id, link kind/id, created_by, expires_at (now + 24h). Grants plus row-level security: staff can insert and read.
- Server function (staff-authenticated) `createTvAppLink(buildId, linkKind, linkId)`: checks the caller is staff and the build is available, creates a short code, and returns the URL plus its expiry time.
- Public route `/api/public/a/$code`: looks up the hashed code, rejects it if expired, and streams that APK from private storage with an `application/vnd.android.package-archive` content type and the original filename.
- `TvRemote.tsx` remote panel: a "Send an app" dialog that reads available `app_builds` rows. On send it uses the existing `launch` event (`com.esaba.downloader`), waits, then sends the existing `text` event with the short URL and an `ok` key. It does not add any new TV command.
- Staff-only internal note on the linked ticket or order, using the existing internal-note path.
- Tests: links expire after 24 hours, non-staff callers are refused, and only ticked apps appear in the install list.
- `app_builds`: new column `install_on_tv boolean default false`, set from a tick box in the admin APK section (admin/management only, using the existing update policy).
- Public route `/api/public/tv-install-list`: returns only the ticked, available current builds (package name, version, file name, and a download path). No private data is included.
- Public route `/api/public/tv-install-apk/$id`: streams the APK only if that build is ticked and available.
- BM TV Enabler (phone `Enabler.java` and Windows `core.cjs`, kept identical): after installing Helper, it fetches the list and checks each app's installed version. Missing or older apps are pushed and installed with the existing ADB push and `pm install -r` path. A failure is skipped. New versions: phone 1.27 and Windows 1.17, released as current downloads.
