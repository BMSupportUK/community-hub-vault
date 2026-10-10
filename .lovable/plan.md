# Android app: dings instead of spoken alerts

## Goal

The Android app stops playing spoken alert messages. Each alert type gets its own short, distinct ding sound — while the app is open, in the background, or closed. Spoken audio messages keep playing in the web browser version exactly as they do today.

## What changes

### 1. New ding sounds (one per alert type)

Create 9 short, distinct ding tones (no speech) for: new ticket, ticket reply, mention, shift starting, shift ending, service outage, outage resolved, new order, payment received. Inbox messages keep the phone's standard notification sound.

### 2. Android app uses the dings

- The app's built-in alert sound settings (notification channels) are recreated with fresh IDs pointing at the new ding files, and the old spoken ones are removed — this is required because Android never updates an existing channel's sound.
- The server push notifications are updated to target the new channel IDs, so closed-app alerts ding with the right per-type sound.
- Foreground alerts (app open on screen) play the same ding per type.

### 3. Spoken audio becomes browser-only

The in-app spoken alerts (mentions, ticket replies, shift start/end, break ending, outstanding tickets, payment confirmed, new orders) are gated so they only play in a web browser. Inside the Android app they stay silent — the ding from step 2 is the only sound.

### 4. New app version

- Bump to version 1.2.1 (versionCode 13), rebuild, sign with the permanent key, and upload so the download button and QR code serve the new file.
- Members on 1.2.0 get the "new version available" prompt and upgrade in place.

## Technical details

- New ding files: `android/app/src/main/res/raw/*_ding.mp3` (short synthesized tones, distinct pitch/pattern per alert type).
- `MainActivity.java`: `createSpokenChannel` calls become ding channels with new IDs (`bm_support_tickets_v4`, `bm_support_shift_start_v5`, `bm_support_shift_end_v5`, `bm_support_outage_v3`, `bm_support_outage_resolved_v3`, `bm_support_orders_v2`, `bm_support_payments_v2`, `bm_support_mentions_v2`, `bm_support_ticket_replies_v3`); old IDs added to `removeOldChannels`.
- `src/lib/fcm.server.ts`: channel/sound mapping updated to the new IDs and ding file names.
- `src/hooks/use-push-register.tsx`: channel creation and foreground notification mapping updated to the new IDs/ding sounds.
- Browser-only gating: each spoken-audio component checks `Capacitor.isNativePlatform()` and skips playback when true (shared helper in `src/lib/`).
- `src/lib/android-release.ts` + `android/app/build.gradle`: version 1.2.1 / 13; APK rebuilt, signed, uploaded via lovable-assets, pointer `src/assets/BMSupport.apk.asset.json` updated.

## Verification

- Build succeeds; APK signature matches the permanent key; download endpoint serves a byte-identical 1.2.1 file.
- Send one test push per alert kind and confirm each arrives (sound itself confirmed on your phones after install).
