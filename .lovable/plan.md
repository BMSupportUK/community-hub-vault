## Fix Android background notification audio

The Android app's background push notifications are silent because the notification channel was created with `sound: "default"`, which Capacitor interprets as a custom sound file lookup in `res/raw/`. Since no such file exists, the channel falls back to silent. Channel sound is immutable after creation, so we need a new channel ID.

### Changes

**1. `src/hooks/use-push-register.tsx`**
- Remove `sound: "default"` from `createChannel` so Android uses the device default ringtone.
- Bump channel ID from `bm_support_alerts_v2` → `bm_support_alerts_v3`.

**2. `android/app/src/main/res/values/strings.xml`**
- Update `default_notification_channel_id` to `bm_support_alerts_v3` so FCM-delivered notifications without an explicit channel land on the new audible channel.

**3. `src/lib/fcm.server.ts`**
- Update `channel_id` in the FCM payload to `bm_support_alerts_v3`.
- Keep `default_sound: true` and `notification_priority: PRIORITY_HIGH`.

**4. `android/app/src/main/AndroidManifest.xml`**
- Add `<uses-permission android:name="android.permission.VIBRATE" />` so vibration fires on devices that enforce the permission.

### Heads up for existing installs

Android caches channel settings, so users with the app already installed must either:
- Uninstall + reinstall, OR
- Open Settings → Apps → BM Support → Notifications and delete the old `v2` channel.

New installs get the audible `v3` channel automatically. iOS and web push paths are unchanged.

### Out of scope

No custom branded sound file is added — we use the OS default. If you later want a branded chime, drop an `.mp3`/`.ogg` into `android/app/src/main/res/raw/`, reference it by filename (without extension) in both `createChannel` and the FCM payload, and bump the channel ID again.