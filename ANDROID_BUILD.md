# BM Support — Android app

This repo ships a Capacitor Android wrapper. The app loads the live published
site (`https://bmsupport.uk`) inside a native Android shell, so UI updates
reach users instantly when you click **Publish** in Lovable — no rebuild
needed for content/UI changes.

## Install the APK

1. Copy `BMSupport.apk` to your Android device (email, Drive, USB, etc.).
2. On the device, open the file. Android will ask to allow installs from
   this source — accept it.
3. Tap **Install**. The app appears in your launcher as **BM Support**.

The APK is signed with a debug key (fine for sideloading, **not** valid for
the Play Store).

## When you need to rebuild

You only need a new APK when something inside the native shell changes:

- App icon / splash screen
- App name, package id, or version
- `capacitor.config.ts`
- Native plugin added/removed

Web/UI changes do **not** require a rebuild.

## Build locally

Requirements: JDK 21, Android SDK with `platforms;android-35` and
`build-tools;35.0.0`.

```bash
npx cap sync android
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

For a release build (Play Store), generate a release keystore and run
`./gradlew assembleRelease` / `bundleRelease`.

## Updating brand assets

Replace `resources/icon.png` and `resources/splash.png` (1024×1024), then:

```bash
npx capacitor-assets generate --android
```

## Notes on notifications

- Realtime in-app notifications (bell, chat, tickets, orders) work while the
  app is open.
- The app does **not** currently send Android system push notifications when
  closed. Add `@capacitor/push-notifications` + Firebase Cloud Messaging to
  enable that.