# BM Player for iPhone/iPad — ad-hoc (up to 100 devices)

## What you get
- A real BM Player app on iPhone/iPad, installed from bmsupport.uk with no App Store.
- Limited to 100 registered devices per Apple membership year. Devices can only be removed at renewal.
- Same login, account-number unlock, Live TV, EPG, Movies, Series, favourites, votes, announcements and sound booster as the other players.

## How a customer gets it
1. Admin approves the person in a new "iOS devices" tab in the Admin Dashboard (it shows how many of the 100 places are used).
2. The customer opens a link on their iPhone and installs a small Apple profile that sends us their device ID. The website records it against their account.
3. Admin adds the ID to Apple (I give a one-click copy list) and I rebuild the app with the new device included.
4. The customer gets a notification and taps "Install BM Player" on the new **BM Player | iOS** card in Install Guides. iPhone installs it directly.
5. Updates use the same card. The app shows an "Update available" prompt, like Direct Install.

## What I need from you first (blockers)
- **Apple Developer Program membership** (£79 a year, in your name or the business's).
- **A way to build iOS apps:** Apple only allows building on a Mac. Either you lend a Mac occasionally, or we use a paid cloud Mac build service (about £0 to £40 a month, depending on how often we build). I'll set up the cloud option unless you have a Mac.
- Apple signing certificate and provisioning files, created once in your Apple account. I'll give step-by-step instructions.

## Steps
1. Build the iOS app by sharing the existing player screens with a native iPhone video player (so it plays the same formats, including 4K on capable devices). Touch controls are designed for phone and tablet.
2. Add device registration: the profile link, a device list in the database, and the admin tab with the 100-slot counter.
3. Add a secure install page: a signed-in, approved-device-only link that serves the app and its install file. Downloads are logged like the other apps.
4. Set up the cloud build so each release is signed with the current device list.
5. Add the BM Player | iOS card in Install Guides, next to the existing Purple Player option. Unapproved users keep seeing Purple Player.

## Limits to know
- Apple can revoke ad-hoc apps that are used like public distribution. Keep it to staff and trusted customers.
- Each new device needs a rebuild before it can install.
- No Apple TV in this plan.

## Technical notes
- Wrap the player UI with Capacitor, using a native AVPlayer/VLCKit plugin for playback. The phone uses the same public player API and device-token auth as the other players.
- Device IDs are collected with a `.mobileconfig` profile service that posts to `/api/public/ios-udid`, which is tied to a one-time token for the signed-in user.
- Installs use an `itms-services` manifest over HTTPS, with short-lived signed links from private storage.
- Rules go in a new `ios-bm-player/AGENTS.md`.
