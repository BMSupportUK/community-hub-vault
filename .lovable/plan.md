# Send one of our apps to the customer's TV

## What staff will see
- A new **Send an app** button in the Remote control section of the screen-share panel. It works the same on **tickets** (ticket Screen share tab) and **orders** (secure checkout Screen share tab), and the link is tied to that ticket or order.
- Pressing it opens a pop-up that lists our current apps from the downloads list, with the name and version of each (for example BM Remote Helper and the player apps).
- Staff pick an app and press **Send to TV**. The site then:
  1. Makes a short link for that app that works for **24 hours**, such as `bmsupport.uk/a/7K2QXP`, tied to this ticket or order.
  2. Opens the Downloader app on the TV and types the link in by itself.
  3. The download starts. Staff then press **Install** on the TV's own install box using the on-screen remote.
- The pop-up shows the link and when it runs out, plus a **Type it again** button in case the TV missed it.
- **Downloader goes on automatically.** During setup, BM TV Enabler (phone and Windows) checks whether Downloader is on the TV. If it isn't, the Enabler installs it the same way it already installs BM Remote Helper, so staff never have to. The Downloader app file is uploaded once to the downloads list under the name "Downloader", and the Enabler always uses the latest copy there.
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
- Tests: links expire after 24 hours, and non-staff callers are refused.
